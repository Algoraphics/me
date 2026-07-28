const REPO_OWNER = 'Algoraphics';
const REPO_NAME = 'Vivarium';
const CONTENT_PATH = 'content';
const IMAGES_PATH = 'images';
const TOKEN_EXPIRY_DAYS = 3;

function getStoredToken() {
    const stored = localStorage.getItem('githubAuth');
    if (!stored) return null;
    try {
        const { token, expiry } = JSON.parse(stored);
        if (Date.now() < expiry) return token;
        localStorage.removeItem('githubAuth');
        return null;
    } catch {
        localStorage.removeItem('githubAuth');
        return null;
    }
}

function setStoredToken(token) {
    const expiry = Date.now() + TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
    localStorage.setItem('githubAuth', JSON.stringify({ token, expiry }));
}

function clearStoredToken() {
    localStorage.removeItem('githubAuth');
}

let githubToken = null;
let wikiData = null;
let currentPage = null;
let originalMarkdown = '';
let isEditMode = false;
let isNewPage = false;
let isMoveMode = false;
let pageToMove = null;
let searchIndex = {};
let searchDebounceTimer = null;
let isFullyIndexed = false;
let currentBlobUrls = [];
let autoSaveTimer = null;
let editStartSha = null;

// GitHub's contents API returns/expects base64. atob/btoa operate on
// one-char-per-byte strings, so they mangle multi-byte UTF-8 (em-dashes,
// curly quotes, arrows, emoji). These helpers round-trip through UTF-8
// properly. For pure-ASCII content they are byte-identical to atob/btoa.
function decodeBase64Utf8(base64) {
    const binary = atob(base64.replace(/\n/g, ''));
    const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
    return new TextDecoder('utf-8').decode(bytes);
}

function encodeUtf8Base64(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = '';
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary);
}

const md = window.markdownit ? window.markdownit({
    html: false,
    linkify: true,
    typographer: true,
    breaks: true
}) : null;

if (!md) {
    console.error('markdown-it library not loaded');
    document.addEventListener('DOMContentLoaded', () => {
        document.body.innerHTML = '<div style="color: red; padding: 20px;">Error: markdown-it library failed to load</div>';
    });
} else {
    md.core.ruler.push('add_data_line', (state) => {
        for (const token of state.tokens) {
            if (token.map && token.map.length && token.type.endsWith('_open')) {
                token.attrJoin('data-line', String(token.map[0]));
            }
        }
    });
}

let expandedParents = new Set();

function saveExpandedState() {
    localStorage.setItem('expandedParents', JSON.stringify([...expandedParents]));
}

function loadExpandedState() {
    const saved = localStorage.getItem('expandedParents');
    if (saved) {
        expandedParents = new Set(JSON.parse(saved));
    }
}

async function githubAPI(endpoint, options = {}) {
    const response = await fetch(`https://api.github.com${endpoint}`, {
        cache: 'no-cache',
        ...options,
        headers: {
            'Authorization': `token ${githubToken}`,
            'Accept': 'application/vnd.github.v3+json',
            ...options.headers
        }
    });
    
    if (!response.ok) {
        const error = new Error(`GitHub API error: ${response.status}`);
        error.status = response.status;
        throw error;
    }

    return response.json();
}

function mergeCachedIntoFresh(freshData) {
    const cachedJson = localStorage.getItem('wikiDataCache_v2');
    if (!cachedJson) return freshData;
    try {
        const cached = JSON.parse(cachedJson);
        const cachedPagesById = {};
        cached.pages.forEach(p => cachedPagesById[p.id] = p);
        freshData.pages.forEach(freshPage => {
            const cachedPage = cachedPagesById[freshPage.id];
            if (cachedPage && cachedPage.loaded) {
                if (cachedPage.contentSha === freshPage.contentSha) {
                    freshPage.markdown = cachedPage.markdown;
                    freshPage.title = cachedPage.title;
                    freshPage.loaded = true;
                } else {
                    freshPage.loaded = false;
                }
            }
        });
    } catch (e) {
        console.warn('Failed to merge cache:', e);
    }
    return freshData;
}

async function syncCurrentPageWithRemote() {
    if (!currentPage || !wikiData || !githubToken) return null;

    try {
        const filePath = `${CONTENT_PATH}/${currentPage}.md`;
        const fileData = await githubAPI(`/repos/${REPO_OWNER}/${REPO_NAME}/contents/${filePath}`);
        const page = wikiData.pagesById[currentPage];
        if (!page) return null;

        if (page.loaded && page.contentSha && page.contentSha !== fileData.sha) {
            if (isEditMode) {
                showStatus('⚠️ This page was updated remotely while editing. Save will overwrite!', 'error');
                document.getElementById('save-button').style.background = '#cc6600';
            } else {
                page.loaded = false;
                await fetchPageContent(currentPage);
                
                await renderPageContent();
            }
            
            return fileData.sha;
        }
        
        return page.contentSha;
    } catch (error) {
        console.log('Remote sync check failed:', error);
        return null;
    }
}

async function loadWikiFromGitHub() {
    const latestCommit = await githubAPI(`/repos/${REPO_OWNER}/${REPO_NAME}/commits/main`);
    const tree = await githubAPI(`/repos/${REPO_OWNER}/${REPO_NAME}/git/trees/${latestCommit.commit.tree.sha}?recursive=1`);
    
    const markdownFiles = tree.tree
        .filter(item => item.path.startsWith(CONTENT_PATH + '/') && item.path.endsWith('.md'))
        .sort((a, b) => a.path.localeCompare(b.path));
    
    
    const pages = [];
    const pagesById = {};
    
    markdownFiles.forEach(file => {
        const pageId = file.path.replace(CONTENT_PATH + '/', '').replace(/\.md$/, '');
        const parts = pageId.split('/');
        const parentId = parts.length > 1 ? parts.slice(0, -1).join('/') : null;
        
        
        const page = {
            id: pageId,
            title: parts[parts.length - 1],
            markdown: null,
            contentSha: file.sha,
            path: file.path,
            parentId: parentId,
            children: [],
            loaded: false
        };
        
        pagesById[pageId] = page;
        pages.push(page);
    });
    
    const tree_root = [];
    pages.forEach(page => {
        if (page.parentId && pagesById[page.parentId]) {
            pagesById[page.parentId].children.push(page.id);
        } else if (!page.parentId) {
            tree_root.push(page.id);
        }
    });
    
    return { pages, pagesById, tree: tree_root, currentCommitSha: latestCommit.sha };
}

async function fetchPageContent(pageId) {
    const page = wikiData.pagesById[pageId];
    if (!page || page.loaded) return page;
    
    try {
        const filePath = `${CONTENT_PATH}/${pageId}.md`;
        const fileData = await githubAPI(`/repos/${REPO_OWNER}/${REPO_NAME}/contents/${filePath}`);
        const markdown = decodeBase64Utf8(fileData.content);
        const title = markdown.match(/^#\s+(.+)$/m)?.[1] || pageId.split('/').pop();
        
        page.markdown = markdown;
        page.title = title;
        page.loaded = true;
        page.contentSha = fileData.sha;
        
        localStorage.setItem('wikiDataCache_v2', JSON.stringify(wikiData));
        return page;
    } catch (error) {
        console.error('Failed to load page:', pageId, error);
        return null;
    }
}

async function loadAllPagesForSearch() {
    const indexBtn = document.getElementById('index-button');
    indexBtn.disabled = true;
    indexBtn.textContent = 'Loading...';
    
    const unloadedPages = wikiData.pages.filter(p => !p.loaded);
    
    const batchSize = 20;
    
    for (let i = 0; i < unloadedPages.length; i += batchSize) {
        const batch = unloadedPages.slice(i, i + batchSize);
        await Promise.allSettled(batch.map(p => fetchPageContent(p.id)));
        
        const progress = Math.min(i + batchSize, unloadedPages.length);
        indexBtn.textContent = `Loading... ${progress}/${unloadedPages.length}`;
    }
    
    updateSearchIndex();
    isFullyIndexed = true;
    indexBtn.textContent = 'Indexed ✓';
    renderSidebar();
}

function updateSearchIndex() {
    searchIndex = {};
    
    let contentIndexed = 0;
    let titleOnly = 0;
    
    wikiData.pages.forEach(page => {
        if (page.loaded && page.markdown) {
            const htmlContent = md.render(page.markdown);
            const plainText = htmlContent.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
            
            searchIndex[page.id] = {
                title: page.title,
                plainText: plainText,
                lowerTitle: page.title.toLowerCase(),
                lowerText: plainText.toLowerCase()
            };
            contentIndexed++;
        } else {
            searchIndex[page.id] = {
                title: page.title,
                plainText: '',
                lowerTitle: page.title.toLowerCase(),
                lowerText: ''
            };
            titleOnly++;
        }
    });
}

function renderPageItem(pageId, isChild = false) {
    const page = wikiData.pagesById[pageId];
    if (!page) return null;
    
    const hasChildren = page.children && page.children.length > 0;
    const isExpanded = expandedParents.has(pageId);
    
    const item = document.createElement('div');
    item.className = 'page-tree-item';
    
    if (hasChildren) {
        const parent = document.createElement('div');
        parent.className = 'page-parent';
        
        const expandIcon = document.createElement('span');
        expandIcon.className = 'expand-icon';
        expandIcon.textContent = isExpanded ? '▼' : '▶';
        parent.appendChild(expandIcon);
        
        const link = document.createElement('a');
        link.href = '#';
        link.className = isChild ? 'child-link' : 'page-link';
        if (currentPage === page.id) {
            link.classList.add('active');
        }
        link.textContent = page.title;
        link.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            loadPage(page.id);
        };
        parent.appendChild(link);
        
        parent.onclick = () => {
            if (isExpanded) {
                expandedParents.delete(pageId);
            } else {
                expandedParents.add(pageId);
            }
            saveExpandedState();
            renderSidebar();
        };
        
        item.appendChild(parent);
        
        const childrenContainer = document.createElement('div');
        childrenContainer.className = 'page-children' + (isExpanded ? ' expanded' : '');
        
        page.children.forEach(childId => {
            const childItem = renderPageItem(childId, true);
            if (childItem) {
                childrenContainer.appendChild(childItem);
            }
        });
        
        item.appendChild(childrenContainer);
    } else {
        const link = document.createElement('a');
        link.href = '#';
        link.className = isChild ? 'child-link' : 'page-link';
        if (currentPage === page.id) {
            link.classList.add('active');
        }
        link.textContent = page.title;
        link.onclick = (e) => {
            e.preventDefault();
            loadPage(page.id);
        };
        item.appendChild(link);
    }
    
    return item;
}

function sortSidebar() {
    if (!wikiData) return;
    const byTitle = (a, b) => {
        const ta = (wikiData.pagesById[a]?.title || '').toLowerCase();
        const tb = (wikiData.pagesById[b]?.title || '').toLowerCase();
        return ta.localeCompare(tb);
    };
    wikiData.tree.sort(byTitle);
    for (const id in wikiData.pagesById) {
        wikiData.pagesById[id].children.sort(byTitle);
    }
}

function renderSidebar() {
    sortSidebar();
    const pageList = document.getElementById('page-list');
    pageList.innerHTML = '';

    wikiData.tree.forEach(pageId => {
        const item = renderPageItem(pageId);
        if (item) {
            pageList.appendChild(item);
        }
    });
}

function saveDraft() {
    if (!isEditMode || !currentPage) return;
    const editorContent = document.getElementById('markdown-editor').value;
    
    if (editorContent === originalMarkdown) {
        clearDraft(currentPage);
        return;
    }
    
    const drafts = JSON.parse(localStorage.getItem('pageDrafts') || '{}');
    
    drafts[currentPage] = {
        content: editorContent,
        baseCommitSha: wikiData.currentCommitSha,
        timestamp: Date.now()
    };
    localStorage.setItem('pageDrafts', JSON.stringify(drafts));
}

function loadDraft(pageId) {
    const drafts = JSON.parse(localStorage.getItem('pageDrafts') || '{}');
    return drafts[pageId] || null;
}

function clearDraft(pageId) {
    const drafts = JSON.parse(localStorage.getItem('pageDrafts') || '{}');
    delete drafts[pageId];
    localStorage.setItem('pageDrafts', JSON.stringify(drafts));
}

function setupInternalLinks() {
    const links = document.querySelectorAll('#content a');
    
    links.forEach(link => {
        const href = link.getAttribute('href');
        if (href && (href.endsWith('.md') || (!href.startsWith('http') && !href.startsWith('#')))) {
            const pageId = href.replace(/\.md$/, '').replace(/^\.\.\//, '');
            
            const page = wikiData.pages.find(p => p.id === pageId || p.id.endsWith('/' + pageId));
            if (page) {
                link.onclick = (e) => {
                    e.preventDefault();
                    loadPage(page.id);
                };
                link.style.cursor = 'pointer';
            }
        }
    });
}

function revokeBlobUrls() {
    currentBlobUrls.forEach(url => URL.revokeObjectURL(url));
    currentBlobUrls = [];
}

async function renderPageContent() {
    const page = wikiData.pagesById[currentPage];
    if (!page || !page.markdown) return;
    
    let htmlContent = md.render(page.markdown);
    htmlContent = htmlContent.replace(/<img src="images\//g, '<img data-src="images/');
    
    document.getElementById('content').innerHTML = htmlContent;
    setupInternalLinks();
    await loadImages();
}

function createBlobFromBase64(base64Image) {
    const byteCharacters = atob(base64Image);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: 'image/jpeg' });
    return URL.createObjectURL(blob);
}

async function loadImages() {
    const images = document.querySelectorAll('#content img[data-src]');
    
    for (const img of images) {
        const dataSrc = img.getAttribute('data-src');
        if (dataSrc && dataSrc.includes('images/')) {
            const imageName = dataSrc.split('/').pop();
            const imagePath = `${IMAGES_PATH}/${imageName}`;
            
            try {
                const contentsData = await githubAPI(`/repos/${REPO_OWNER}/${REPO_NAME}/contents/${imagePath}`);
                
                let base64Image;
                if (contentsData.encoding === 'base64' && contentsData.content) {
                    base64Image = contentsData.content.replace(/[\n\r]/g, '');
                } else {
                    const blobSha = contentsData.sha;
                    const blobData = await githubAPI(`/repos/${REPO_OWNER}/${REPO_NAME}/git/blobs/${blobSha}`);
                    base64Image = blobData.content.replace(/[\n\r]/g, '');
                }
                
                const blobUrl = createBlobFromBase64(base64Image);
                img.src = blobUrl;
                img.removeAttribute('data-src');
                currentBlobUrls.push(blobUrl);
            } catch (error) {
                console.error('Failed to load image:', imageName, error);
                img.alt = '[Image failed to load]';
            }
        }
    }
}

function expandAncestors(pageId) {
    const page = wikiData.pagesById[pageId];
    if (!page) return;
    
    if (page.parentId) {
        expandedParents.add(page.parentId);
        saveExpandedState();
        expandAncestors(page.parentId);
    }
}

let isHandlingPopstate = false;

async function loadPage(pageId, skipHistory = false) {
    if (isEditMode && currentPage && currentPage !== pageId) {
        saveDraft();
        closeEditMode();
    }
    
    revokeBlobUrls();
    
    const page = wikiData.pagesById[pageId];
    if (!page) return;
    
    expandAncestors(pageId);
    currentPage = pageId;
    
    if (!page.loaded) {
        document.getElementById('content').innerHTML = '<p style="color: #999;">Loading...</p>';
        await fetchPageContent(pageId);
        updateSearchIndex();
    } else {
        await syncCurrentPageWithRemote();
    }
    
    await renderPageContent();
    renderSidebar();
    
    setTimeout(() => {
        const activeLink = document.querySelector('.page-link.active, .child-link.active');
        if (activeLink) {
            activeLink.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }, 100);
    
    updateMoveButtons();
    
    sessionStorage.setItem('currentPage', pageId);
    
    if (!skipHistory && !isHandlingPopstate) {
        const url = `#${pageId}`;
        history.pushState({ pageId }, '', url);
    }
    
    const draft = loadDraft(pageId);
    if (draft && !isMoveMode) {
        enterEditMode(draft);
    }
}

async function login() {
    const token = document.getElementById('token-input').value;
    const errorMsg = document.getElementById('error-message');
    const loadingMsg = document.getElementById('loading-message');
    
    errorMsg.style.display = 'none';
    loadingMsg.style.display = 'block';
    
    githubToken = token;
    
    try {
        await githubAPI('/user');
        
        const freshData = await loadWikiFromGitHub();
        wikiData = mergeCachedIntoFresh(freshData);
        localStorage.setItem('wikiDataCache_v2', JSON.stringify(wikiData));
        
        setStoredToken(token);
        
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('wiki-container').style.display = 'flex';
        document.documentElement.style.visibility = 'visible';
        
        loadExpandedState();
        renderSidebar();
        updateSearchIndex();
        
        const loadedCount = wikiData.pages.filter(p => p.loaded).length;
        if (loadedCount === wikiData.pages.length) {
            isFullyIndexed = true;
            document.getElementById('index-button').textContent = 'Indexed ✓';
            document.getElementById('index-button').disabled = true;
        }
        
        const lastPage = sessionStorage.getItem('currentPage') || 'home';
        const initialPageId = location.hash ? location.hash.substring(1) : lastPage;
        if (wikiData.pagesById[initialPageId]) {
            history.replaceState({ pageId: initialPageId }, '', `#${initialPageId}`);
            loadPage(initialPageId, true);
        } else {
            loadPage(lastPage, true);
        }
        updateMoveButtons();
    } catch (error) {
        console.error('Login failed:', error);
        loadingMsg.style.display = 'none';
        errorMsg.style.display = 'block';
        document.getElementById('login-form').style.display = 'block';
        document.documentElement.style.visibility = 'visible';
        githubToken = null;
    }
}

function logout() {
    clearStoredToken();
    sessionStorage.removeItem('currentPage');
    localStorage.removeItem('wikiDataCache_v2');
    localStorage.removeItem('pageDrafts');
    localStorage.removeItem('expandedParents');
    
    githubToken = null;
    wikiData = null;
    currentPage = null;
    isFullyIndexed = false;
    
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('wiki-container').style.display = 'none';
    document.getElementById('token-input').value = '';
    document.getElementById('login-form').style.display = 'block';
    document.getElementById('loading-message').style.display = 'none';
    document.getElementById('error-message').style.display = 'none';
}

async function enterEditMode(draft = null) {
    const page = wikiData.pagesById[currentPage];

    const statusMsg = document.getElementById('status-message');
    statusMsg.textContent = '';
    statusMsg.className = '';

    if (!page.loaded && !draft) {
        await fetchPageContent(currentPage);
    }
    
    await syncCurrentPageWithRemote();
    
    editStartSha = page.contentSha;
    
    if (draft && draft.baseCommitSha && draft.baseCommitSha !== wikiData.currentCommitSha) {
        showStatus('⚠️ Warning: Page was updated since this draft was created. Save may overwrite remote changes.', 'error');
        document.getElementById('save-button').style.background = '#cc6600';
    }
    
    const viewLine = getTopVisibleLineFromView();

    if (!draft) {
        originalMarkdown = page.markdown;
        document.getElementById('markdown-editor').value = page.markdown;
    } else {
        document.getElementById('markdown-editor').value = draft.content;
    }

    document.getElementById('view-mode').style.display = 'none';
    document.getElementById('edit-mode').style.display = 'flex';
    document.getElementById('edit-button').textContent = 'View';
    isEditMode = true;
    if (window.innerWidth <= 768) {
        sidebarWasCollapsedBeforeEdit = document.getElementById('sidebar').classList.contains('collapsed');
        setSidebarCollapsed(true);
    }

    if (viewLine !== null) scrollEditorToLine(viewLine);
}

function getLeafDataLineBlocks() {
    return [...document.querySelectorAll('#content [data-line]')]
        .filter(el => !el.querySelector('[data-line]'));
}

function getViewVisibleTop() {
    const wrapper = document.getElementById('content-wrapper');
    if (!wrapper) return null;
    const wrapperTop = wrapper.getBoundingClientRect().top;
    const header = document.getElementById('page-header');
    const headerHeight = (header && header.offsetParent) ? header.getBoundingClientRect().height : 0;
    return { wrapper, visibleTop: wrapperTop + headerHeight };
}

function getTopVisibleLineFromView() {
    const ctx = getViewVisibleTop();
    if (!ctx) return null;
    const { visibleTop } = ctx;
    for (const b of getLeafDataLineBlocks()) {
        const rect = b.getBoundingClientRect();
        if (rect.bottom > visibleTop + 1) {
            return parseInt(b.getAttribute('data-line'), 10);
        }
    }
    return null;
}

function scrollViewToLine(line) {
    const ctx = getViewVisibleTop();
    if (!ctx) return;
    const { wrapper, visibleTop } = ctx;
    let target = null;
    for (const b of getLeafDataLineBlocks()) {
        const startLine = parseInt(b.getAttribute('data-line'), 10);
        if (startLine > line) break;
        target = b;
    }
    if (!target) return;
    const rect = target.getBoundingClientRect();
    wrapper.scrollTop += (rect.top - visibleTop);
}

function withEditorMirror(fn) {
    const editor = document.getElementById('markdown-editor');
    const style = getComputedStyle(editor);
    const mirror = document.createElement('div');
    Object.assign(mirror.style, {
        position: 'absolute',
        top: '0',
        left: '0',
        visibility: 'hidden',
        whiteSpace: 'pre-wrap',
        wordWrap: 'break-word',
        overflowWrap: 'break-word',
        boxSizing: 'border-box',
        width: editor.clientWidth + 'px',
        paddingTop: style.paddingTop,
        paddingRight: style.paddingRight,
        paddingBottom: style.paddingBottom,
        paddingLeft: style.paddingLeft,
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        lineHeight: style.lineHeight,
        letterSpacing: style.letterSpacing,
        tabSize: style.tabSize
    });
    const lines = editor.value.split('\n');
    const markers = [];
    for (let i = 0; i < lines.length; i++) {
        const span = document.createElement('span');
        span.dataset.l = String(i);
        markers.push(span);
        mirror.appendChild(span);
        if (lines[i].length > 0) mirror.appendChild(document.createTextNode(lines[i]));
        if (i < lines.length - 1) mirror.appendChild(document.createTextNode('\n'));
    }
    document.body.appendChild(mirror);
    try {
        return fn(markers);
    } finally {
        mirror.remove();
    }
}

function scrollEditorToLine(line) {
    const editor = document.getElementById('markdown-editor');
    const offset = withEditorMirror((markers) => {
        const m = markers[Math.min(line, markers.length - 1)];
        return m ? m.offsetTop : 0;
    });
    editor.scrollTop = Math.max(0, offset);
}

function getTopVisibleLineFromEditor() {
    const editor = document.getElementById('markdown-editor');
    const scrollTop = editor.scrollTop;
    return withEditorMirror((markers) => {
        let best = 0;
        for (const m of markers) {
            if (m.offsetTop > scrollTop) break;
            best = parseInt(m.dataset.l, 10);
        }
        return best;
    });
}

let sidebarWasCollapsedBeforeEdit = null;

function closeEditMode() {
    const editorLine = isEditMode ? getTopVisibleLineFromEditor() : null;

    document.getElementById('view-mode').style.display = 'block';
    document.getElementById('edit-mode').style.display = 'none';
    document.getElementById('edit-button').textContent = 'Edit';
    document.getElementById('save-button').style.background = '';
    document.getElementById('status-message').className = '';
    document.getElementById('status-message').textContent = '';
    isEditMode = false;
    isNewPage = false;
    editStartSha = null;
    if (sidebarWasCollapsedBeforeEdit === false) {
        setSidebarCollapsed(false);
    }
    sidebarWasCollapsedBeforeEdit = null;

    if (editorLine !== null) scrollViewToLine(editorLine);
}

function startNewPage() {
    const existingDraft = loadDraft(currentPage);
    if (existingDraft && isEditMode && !isNewPage) {
        if (!confirm('You have an unsaved draft for this page. Creating a new page will discard that draft.\n\nContinue?')) {
            return;
        }
        clearDraft(currentPage);
    }
    
    isNewPage = true;
    originalMarkdown = '';

    const statusMsg = document.getElementById('status-message');
    statusMsg.textContent = '';
    statusMsg.className = '';

    document.getElementById('markdown-editor').value = '# \n\n';
    document.getElementById('view-mode').style.display = 'none';
    document.getElementById('edit-mode').style.display = 'flex';
    document.getElementById('edit-button').textContent = 'View';
    isEditMode = true;
    updateMoveButtons();
    if (window.innerWidth <= 768) {
        sidebarWasCollapsedBeforeEdit = document.getElementById('sidebar').classList.contains('collapsed');
        setSidebarCollapsed(true);
    }
    
    setTimeout(() => {
        const editor = document.getElementById('markdown-editor');
        editor.focus();
        editor.setSelectionRange(2, 2);
    }, 100);
}

function startMoveMode() {
    const page = wikiData.pagesById[currentPage];
    if (page.children && page.children.length > 0) {
        showStatus('Cannot move pages with children. Use Git.', 'error');
        return;
    }
    
    isMoveMode = true;
    pageToMove = currentPage;
    updateMoveButtons();
}

function cancelMoveMode() {
    isMoveMode = false;
    pageToMove = null;
    updateMoveButtons();
}

function updateMoveButtons() {
    const deleteBtn = document.getElementById('delete-button');
    const moveBtn = document.getElementById('move-button');
    const newPageBtn = document.getElementById('new-page-button');
    const editBtn = document.getElementById('edit-button');
    
    if (!deleteBtn || !moveBtn || !newPageBtn || !editBtn) {
        return;
    }
    
    if (!currentPage || !wikiData || !wikiData.pagesById) {
        deleteBtn.style.display = 'none';
        moveBtn.style.display = 'none';
        return;
    }
    
    const page = wikiData.pagesById[currentPage];
    if (!page) {
        deleteBtn.style.display = 'none';
        moveBtn.style.display = 'none';
        return;
    }
    
    const isHomePage = currentPage === 'home';
    const hasChildren = page.children && page.children.length > 0;
    const canMoveOrDelete = !isHomePage && !hasChildren;
    
    if (isMoveMode) {
        deleteBtn.style.display = 'none';
        if (currentPage === pageToMove) {
            moveBtn.style.display = 'none';
        } else {
            moveBtn.style.display = 'inline-block';
            moveBtn.textContent = 'Place Here';
        }
        newPageBtn.style.display = 'none';
        editBtn.textContent = 'Cancel Move';
    } else {
        deleteBtn.style.display = canMoveOrDelete ? 'inline-block' : 'none';
        moveBtn.style.display = canMoveOrDelete ? 'inline-block' : 'none';
        moveBtn.textContent = 'Move';
        newPageBtn.style.display = 'inline-block';
        editBtn.textContent = isEditMode ? 'View' : 'Edit';
    }
}

async function executeMove(newParentId) {
    const oldId = pageToMove;
    const oldPath = `${CONTENT_PATH}/${oldId}.md`;
    const pageName = oldId.split('/').pop();
    const newId = newParentId ? `${newParentId}/${pageName}` : pageName;
    const newPath = `${CONTENT_PATH}/${newId}.md`;

    if (oldPath === newPath) {
        showStatus('Page is already in this location', 'error');
        cancelMoveMode();
        return;
    }

    const moveBtn = document.getElementById('move-button');
    const oldBtnText = moveBtn.textContent;
    moveBtn.textContent = 'Placing...';
    moveBtn.disabled = true;
    showStatus('Moving page to new location...', 'success');

    try {
        await performAction({
            run: async () => {
                const oldData = await githubAPI(`/repos/${REPO_OWNER}/${REPO_NAME}/contents/${oldPath}`);
                const content = atob(oldData.content.replace(/\n/g, ''));

                const created = await githubAPI(`/repos/${REPO_OWNER}/${REPO_NAME}/contents/${newPath}`, {
                    method: 'PUT',
                    body: JSON.stringify({
                        message: `Move ${oldId} to ${newId}`,
                        content: btoa(content),
                        sha: null
                    })
                });

                try {
                    await githubAPI(`/repos/${REPO_OWNER}/${REPO_NAME}/contents/${oldPath}`, {
                        method: 'DELETE',
                        body: JSON.stringify({
                            message: `Delete old location of ${oldId}`,
                            sha: oldData.sha
                        })
                    });
                } catch (e) {
                    const partial = new Error('Move partially completed — duplicate file remains at old path.');
                    partial.partialMove = { oldPath, newPath, cause: e };
                    throw partial;
                }

                return {
                    content,
                    contentSha: created.content?.sha || null,
                    commitSha: created.commit?.sha || null
                };
            },
            applyPatch: ({ content, contentSha, commitSha }) => {
                const oldPage = wikiData.pagesById[oldId];

                if (oldPage.parentId && wikiData.pagesById[oldPage.parentId]) {
                    const sibs = wikiData.pagesById[oldPage.parentId].children;
                    const idx = sibs.indexOf(oldId);
                    if (idx >= 0) sibs.splice(idx, 1);
                } else {
                    const idx = wikiData.tree.indexOf(oldId);
                    if (idx >= 0) wikiData.tree.splice(idx, 1);
                }

                delete wikiData.pagesById[oldId];
                oldPage.id = newId;
                oldPage.parentId = newParentId || null;
                oldPage.markdown = content;
                oldPage.loaded = true;
                oldPage.contentSha = contentSha || oldPage.contentSha;
                oldPage.title = content.match(/^#\s+(.+)$/m)?.[1] || pageName;
                wikiData.pagesById[newId] = oldPage;

                if (newParentId && wikiData.pagesById[newParentId]) {
                    wikiData.pagesById[newParentId].children.push(newId);
                } else if (!newParentId) {
                    wikiData.tree.push(newId);
                }

                if (commitSha) wikiData.currentCommitSha = commitSha;

                currentPage = newId;
                expandAncestors(newId);
                sessionStorage.setItem('currentPage', newId);
                history.pushState({ pageId: newId }, '', `#${newId}`);
            }
        });

        cancelMoveMode();
        moveBtn.textContent = oldBtnText;
        moveBtn.disabled = false;
        showStatus('Page moved!', 'success');
    } catch (error) {
        moveBtn.textContent = oldBtnText;
        moveBtn.disabled = false;
        cancelMoveMode();

        if (error.partialMove) {
            showStatus(`⚠️ Move partially completed — duplicate file at ${error.partialMove.oldPath}. Try again or delete the duplicate manually.`, 'error');
            try { await refreshTreeFromRemote(); } catch (e) { /* ignored */ }
        } else if (error.status === 422) {
            showStatus('A page already exists at the destination.', 'error');
        } else if (error.status === 404) {
            showStatus('Source page no longer exists. Refreshing tree...', 'error');
            try { await refreshTreeFromRemote(); } catch (e) { /* ignored */ }
        } else {
            showStatus('Failed to move: ' + error.message, 'error');
        }
    }
}

async function deletePage() {
    const page = wikiData.pagesById[currentPage];

    if (page.children && page.children.length > 0) {
        showStatus('Cannot delete pages with children. Delete children first.', 'error');
        return;
    }

    if (!confirm(`Are you sure you want to delete "${page.title}"?\n\nThis cannot be undone!`)) {
        return;
    }

    const deletedId = currentPage;
    const sha = page.contentSha;
    const fallback = (page.parentId && wikiData.pagesById[page.parentId])
        ? page.parentId
        : (wikiData.tree.find(id => id !== deletedId) || null);

    function applyDeletePatch() {
        const p = wikiData.pagesById[deletedId];
        if (!p) return;
        if (p.parentId && wikiData.pagesById[p.parentId]) {
            const sibs = wikiData.pagesById[p.parentId].children;
            const idx = sibs.indexOf(deletedId);
            if (idx >= 0) sibs.splice(idx, 1);
        } else {
            const idx = wikiData.tree.indexOf(deletedId);
            if (idx >= 0) wikiData.tree.splice(idx, 1);
        }
        wikiData.pages = wikiData.pages.filter(x => x.id !== deletedId);
        delete wikiData.pagesById[deletedId];
    }

    async function navigateToFallback() {
        currentPage = null;
        if (fallback && wikiData.pagesById[fallback]) {
            await loadPage(fallback);
        } else {
            sessionStorage.removeItem('currentPage');
            document.getElementById('content').innerHTML = '<p style="color: #999;">No page selected.</p>';
        }
    }

    showStatus('Deleting page...', 'success');

    try {
        await performAction({
            run: () => githubAPI(`/repos/${REPO_OWNER}/${REPO_NAME}/contents/${CONTENT_PATH}/${deletedId}.md`, {
                method: 'DELETE',
                body: JSON.stringify({
                    message: `Delete ${deletedId}`,
                    sha
                })
            }),
            applyPatch: applyDeletePatch
        });
        await navigateToFallback();
        showStatus('Page deleted!', 'success');
    } catch (error) {
        if (error.status === 404) {
            applyDeletePatch();
            localStorage.setItem('wikiDataCache_v2', JSON.stringify(wikiData));
            renderSidebar();
            await navigateToFallback();
            showStatus('Page was already deleted remotely.', 'success');
        } else if (error.status === 409) {
            showStatus('Page was edited remotely after you loaded it. Refresh and try again.', 'error');
        } else {
            showStatus('Failed to delete: ' + error.message, 'error');
        }
    }
}

function cancelEdit() {
    const currentContent = document.getElementById('markdown-editor').value;
    
    if (currentContent !== originalMarkdown) {
        if (!confirm('You have unsaved changes. Are you sure you want to discard them?')) {
            return;
        }
    }
    
    if (currentPage) {
        clearDraft(currentPage);
    }
    closeEditMode();
}

function generateFilename(content) {
    const h1Match = content.match(/^#\s+(.+)$/m);
    if (h1Match) {
        return h1Match[1].toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');
    }
    
    const firstText = content.trim().substring(0, 50)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
    
    return firstText || 'untitled';
}

function getUniqueFilename(parentPageId, filename) {
    const prefix = parentPageId ? `${parentPageId}/` : '';
    let finalName = filename;
    let counter = 1;
    while (wikiData.pagesById[`${prefix}${finalName}`]) {
        finalName = `${filename}-${counter}`;
        counter++;
    }
    return finalName;
}

async function refreshTreeFromRemote() {
    const fresh = await loadWikiFromGitHub();
    wikiData = mergeCachedIntoFresh(fresh);
    localStorage.setItem('wikiDataCache_v2', JSON.stringify(wikiData));
    renderSidebar();
}

async function performAction(def) {
    const result = await def.run();
    def.applyPatch(result);
    localStorage.setItem('wikiDataCache_v2', JSON.stringify(wikiData));
    renderSidebar();
    await renderPageContent();
    return result;
}

async function saveEdit() {
    const newContent = document.getElementById('markdown-editor').value;
    
    if (!newContent.trim()) {
        showStatus('Page cannot be empty', 'error');
        return;
    }
    
    if (isNewPage) {
        await saveNewPage(newContent);
        return;
    }

    const page = wikiData.pagesById[currentPage];

    if (editStartSha && editStartSha !== page.contentSha) {
        if (!confirm('⚠️ WARNING: This page was updated remotely since you started editing.\n\nSaving will OVERWRITE the remote changes.\n\nAre you sure you want to continue?')) {
            return;
        }
    }

    if (newContent === originalMarkdown) {
        showStatus('No changes to save', 'error');
        return;
    }

    document.getElementById('save-button').disabled = true;
    showStatus('Saving to GitHub...', 'success');

    const filePath = `${CONTENT_PATH}/${currentPage}.md`;
    const editedPageId = currentPage;

    try {
        await performAction({
            run: async () => {
                const resp = await githubAPI(`/repos/${REPO_OWNER}/${REPO_NAME}/contents/${filePath}`, {
                    method: 'PUT',
                    body: JSON.stringify({
                        message: `Update ${editedPageId}`,
                        content: encodeUtf8Base64(newContent),
                        sha: page.contentSha
                    })
                });
                return {
                    contentSha: resp.content?.sha || null,
                    commitSha: resp.commit?.sha || null
                };
            },
            applyPatch: ({ contentSha, commitSha }) => {
                page.markdown = newContent;
                page.loaded = true;
                page.contentSha = contentSha || page.contentSha;
                page.title = newContent.match(/^#\s+(.+)$/m)?.[1] || page.title;
                if (commitSha) wikiData.currentCommitSha = commitSha;
                originalMarkdown = newContent;
                clearDraft(editedPageId);
            }
        });

        closeEditMode();
        document.getElementById('save-button').disabled = false;
        showStatus('Saved!', 'success');
    } catch (error) {
        if (error.status === 409) {
            showStatus('⚠️ Save failed: Remote was updated. Cancel/stash this edit and refresh to get latest.', 'error');
        } else if (error.status === 404) {
            showStatus('⚠️ This page no longer exists remotely. Refresh to see current state.', 'error');
        } else {
            showStatus('Failed to save: ' + error.message, 'error');
        }
        document.getElementById('save-button').disabled = false;
    }
}

async function saveNewPage(newContent) {
    const parentPageId = currentPage;
    const baseName = generateFilename(newContent);
    const uniqueName = getUniqueFilename(parentPageId, baseName);
    const newPageId = parentPageId ? `${parentPageId}/${uniqueName}` : uniqueName;
    const filePath = `${CONTENT_PATH}/${newPageId}.md`;
    const title = newContent.match(/^#\s+(.+)$/m)?.[1] || uniqueName;

    document.getElementById('save-button').disabled = true;
    showStatus('Saving to GitHub...', 'success');

    try {
        await performAction({
            run: async () => {
                const resp = await githubAPI(`/repos/${REPO_OWNER}/${REPO_NAME}/contents/${filePath}`, {
                    method: 'PUT',
                    body: JSON.stringify({
                        message: `Create ${newPageId}`,
                        content: encodeUtf8Base64(newContent),
                        sha: null
                    })
                });
                return {
                    contentSha: resp.content?.sha || null,
                    commitSha: resp.commit?.sha || null
                };
            },
            applyPatch: ({ contentSha, commitSha }) => {
                const parentId = newPageId.includes('/') ? newPageId.substring(0, newPageId.lastIndexOf('/')) : null;
                const newPage = {
                    id: newPageId,
                    title,
                    parentId,
                    children: [],
                    markdown: newContent,
                    loaded: true,
                    contentSha
                };
                wikiData.pagesById[newPageId] = newPage;
                wikiData.pages.push(newPage);
                if (parentId && wikiData.pagesById[parentId]) {
                    wikiData.pagesById[parentId].children.push(newPageId);
                } else if (!parentId) {
                    wikiData.tree.push(newPageId);
                }
                if (commitSha) wikiData.currentCommitSha = commitSha;

                if (parentPageId) clearDraft(parentPageId);
                clearDraft(newPageId);
                expandAncestors(newPageId);
                currentPage = newPageId;
                originalMarkdown = newContent;
                isNewPage = false;
                sessionStorage.setItem('currentPage', newPageId);
                history.pushState({ pageId: newPageId }, '', `#${newPageId}`);
            }
        });

        closeEditMode();
        document.getElementById('save-button').disabled = false;
        showStatus('Saved!', 'success');
    } catch (error) {
        if (error.status === 422) {
            showStatus('⚠️ A page with that name was just created remotely. Refreshing tree...', 'error');
            try { await refreshTreeFromRemote(); } catch (e) { /* surfaced below */ }
        } else {
            showStatus('Failed to save: ' + error.message, 'error');
        }
        document.getElementById('save-button').disabled = false;
    }
}

function showStatus(message, type = '') {
    const editStatus = document.getElementById('status-message');
    if (editStatus) {
        editStatus.textContent = message;
        editStatus.className = type;
    }
    
    const pageStatus = document.getElementById('page-status');
    if (pageStatus) {
        pageStatus.textContent = message;
        pageStatus.className = type;
        if (message) {
            setTimeout(() => {
                if (pageStatus.textContent === message) {
                    pageStatus.textContent = '';
                    pageStatus.className = '';
                }
            }, 5000);
        }
    }
}

function insertMarkdown(before, after) {
    const editor = document.getElementById('markdown-editor');
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const selectedText = editor.value.substring(start, end);
    const newText = before + selectedText + after;
    
    editor.value = editor.value.substring(0, start) + newText + editor.value.substring(end);
    
    const newCursorPos = selectedText ? start + newText.length : start + before.length;
    editor.focus();
    editor.setSelectionRange(newCursorPos, newCursorPos);
}

let lastSelection = { start: 0, end: 0, text: '' };

function captureSelection() {
    const editor = document.getElementById('markdown-editor');
    if (editor === document.activeElement) {
        lastSelection = {
            start: editor.selectionStart,
            end: editor.selectionEnd,
            text: editor.value.substring(editor.selectionStart, editor.selectionEnd).trim()
        };
    }
}

let wikiLinkPickerSelection = null;
let wikiLinkResults = [];
let wikiLinkActiveIndex = 0;

function openWikiLinkPicker() {
    const editor = document.getElementById('markdown-editor');
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const selectedText = editor.value.substring(start, end);
    if (selectedText.trim()) {
        wikiLinkPickerSelection = { start, end, text: selectedText };
    } else if (lastSelection.text) {
        wikiLinkPickerSelection = { start: lastSelection.start, end: lastSelection.end, text: lastSelection.text };
    } else {
        wikiLinkPickerSelection = { start, end, text: '' };
    }

    const picker = document.getElementById('wiki-link-modal');
    const input = document.getElementById('wiki-link-search');
    picker.classList.remove('hidden');
    input.value = wikiLinkPickerSelection.text.trim();
    renderWikiLinkResults();
    input.focus();
    input.select();
}

function closeWikiLinkPicker() {
    document.getElementById('wiki-link-modal').classList.add('hidden');
    document.getElementById('wiki-link-search').value = '';
    wikiLinkResults = [];
    wikiLinkActiveIndex = 0;
}

function renderWikiLinkResults() {
    const query = document.getElementById('wiki-link-search').value.trim();
    const lowerQuery = query.toLowerCase();
    const container = document.getElementById('wiki-link-results');
    container.innerHTML = '';

    if (!query) {
        wikiLinkResults = wikiData.pages.slice().sort((a, b) => a.title.localeCompare(b.title)).slice(0, 30);
    } else {
        const matches = [];
        for (const page of wikiData.pages) {
            const idx = searchIndex[page.id];
            if (!idx) continue;
            const titleMatch = idx.lowerTitle.includes(lowerQuery);
            const contentMatch = idx.lowerText.includes(lowerQuery);
            if (!titleMatch && !contentMatch) continue;
            let rank;
            if (idx.lowerTitle === lowerQuery) rank = 0;
            else if (idx.lowerTitle.startsWith(lowerQuery)) rank = 1;
            else if (titleMatch) rank = 2;
            else rank = 3;
            matches.push({ page, rank });
        }
        matches.sort((a, b) => a.rank - b.rank || a.page.title.localeCompare(b.page.title));
        wikiLinkResults = matches.slice(0, 30).map(m => m.page);
    }

    wikiLinkActiveIndex = Math.min(wikiLinkActiveIndex, Math.max(0, wikiLinkResults.length - 1));

    wikiLinkResults.forEach((page, i) => {
        const div = document.createElement('div');
        div.className = 'wiki-link-result' + (i === wikiLinkActiveIndex ? ' active' : '');
        const title = document.createElement('div');
        title.className = 'wiki-link-result-title';
        title.textContent = page.title;
        div.appendChild(title);
        const id = document.createElement('div');
        id.className = 'wiki-link-result-id';
        id.textContent = page.id;
        div.appendChild(id);
        div.onclick = () => insertWikiLink(page);
        container.appendChild(div);
    });
}

function insertWikiLink(page) {
    const editor = document.getElementById('markdown-editor');
    const sel = wikiLinkPickerSelection || { start: editor.selectionStart, end: editor.selectionEnd, text: '' };
    const linkText = sel.text.trim() || page.title;
    const linkMarkdown = `[${linkText}](${page.id})`;
    editor.value = editor.value.substring(0, sel.start) + linkMarkdown + editor.value.substring(sel.end);
    const cursorPos = sel.start + linkMarkdown.length;
    closeWikiLinkPicker();
    editor.focus();
    editor.setSelectionRange(cursorPos, cursorPos);
    lastSelection = { start: 0, end: 0, text: '' };
}

function insertLink() {
    const editor = document.getElementById('markdown-editor');
    
    let start = editor.selectionStart;
    let end = editor.selectionEnd;
    let selectedText = editor.value.substring(start, end).trim();
    
    if (!selectedText && lastSelection.text) {
        start = lastSelection.start;
        end = lastSelection.end;
        selectedText = lastSelection.text;
    }
    
    if (!selectedText) {
        const linkMarkdown = `[link text]()`;
        editor.value = editor.value.substring(0, start) + linkMarkdown + editor.value.substring(end);
        const cursorPos = start + linkMarkdown.length - 1;
        editor.focus();
        editor.setSelectionRange(cursorPos, cursorPos);
        return;
    }
    
    const linkText = selectedText;
    const pageUrl = selectedText.toLowerCase().replace(/\s+/g, '-');
    
    const linkMarkdown = `[${linkText}](${pageUrl})`;
    
    editor.value = editor.value.substring(0, start) + linkMarkdown + editor.value.substring(end);
    
    const cursorPos = start + linkMarkdown.length;
    editor.focus();
    editor.setSelectionRange(cursorPos, cursorPos);
    
    lastSelection = { start: 0, end: 0, text: '' };
}

function searchPages(query) {
    if (!query.trim()) {
        document.getElementById('search-results').classList.remove('active');
        return;
    }
    
    const results = [];
    const lowerQuery = query.toLowerCase();
    
    wikiData.pages.forEach(page => {
        const pageIndex = searchIndex[page.id];
        if (!pageIndex) return;
        
        const titleMatch = pageIndex.lowerTitle.includes(lowerQuery);
        const contentMatch = pageIndex.lowerText.includes(lowerQuery);
        
        if (titleMatch || contentMatch) {
            let snippet = '';
            if (contentMatch) {
                const index = pageIndex.lowerText.indexOf(lowerQuery);
                const start = Math.max(0, index - 40);
                const end = Math.min(pageIndex.plainText.length, index + lowerQuery.length + 40);
                let rawSnippet = pageIndex.plainText.substring(start, end);

                const beforeMatch = rawSnippet.substring(0, index - start);
                const match = rawSnippet.substring(index - start, index - start + query.length);
                const afterMatch = rawSnippet.substring(index - start + query.length);

                snippet = (start > 0 ? '...' : '') + beforeMatch + '<span class="search-highlight">' + match + '</span>' + afterMatch + (end < pageIndex.plainText.length ? '...' : '');
            }

            let rank;
            if (pageIndex.lowerTitle === lowerQuery) rank = 0;
            else if (pageIndex.lowerTitle.startsWith(lowerQuery)) rank = 1;
            else if (titleMatch) rank = 2;
            else rank = 3;

            results.push({ page, snippet, rank });
        }
    });

    results.sort((a, b) => a.rank - b.rank || a.page.title.localeCompare(b.page.title));
    
    const resultsContainer = document.getElementById('search-results');
    resultsContainer.innerHTML = '';
    
    if (results.length > 0) {
        const limitedResults = results.slice(0, 20);
        const hasMore = results.length > 20;
        
        limitedResults.forEach(({ page, snippet }) => {
            const resultDiv = document.createElement('div');
            resultDiv.className = 'search-result';
            resultDiv.onclick = () => {
                loadPage(page.id);
                document.getElementById('search-box').value = '';
                searchPages('');
            };
            
            const title = document.createElement('div');
            title.className = 'search-result-title';
            title.textContent = page.title;
            resultDiv.appendChild(title);
            
            if (snippet) {
                const snippetDiv = document.createElement('div');
                snippetDiv.className = 'search-result-snippet';
                snippetDiv.innerHTML = snippet;
                resultDiv.appendChild(snippetDiv);
            }
            
            resultsContainer.appendChild(resultDiv);
        });
        
        if (hasMore) {
            const moreDiv = document.createElement('div');
            moreDiv.style.color = '#999';
            moreDiv.style.padding = '10px';
            moreDiv.style.fontSize = '0.9em';
            moreDiv.textContent = `...and ${results.length - 20} more results`;
            resultsContainer.appendChild(moreDiv);
        }
        
        resultsContainer.classList.add('active');
    } else {
        resultsContainer.innerHTML = '<div style="color: #999; padding: 10px;">No results found. Index to search page content.</div>';
        resultsContainer.classList.add('active');
    }
}

function debouncedSearch(query) {
    if (searchDebounceTimer) {
        clearTimeout(searchDebounceTimer);
    }
    searchDebounceTimer = setTimeout(() => {
        searchPages(query);
    }, 300);
}

async function handleImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    if (file.size > 5 * 1024 * 1024) {
        showStatus('Image too large! Max 5MB', 'error');
        return;
    }
    
    try {
        showStatus('Uploading image...', 'success');
        
        const reader = new FileReader();
        reader.onload = async (e) => {
            const base64Content = e.target.result.split(',')[1];
            const fileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
            const imagePath = `${IMAGES_PATH}/${fileName}`;
            
            try {
                let sha = null;
                try {
                    const existing = await githubAPI(`/repos/${REPO_OWNER}/${REPO_NAME}/contents/${imagePath}`);
                    sha = existing.sha;
                } catch (e) {
                }
                
                await githubAPI(`/repos/${REPO_OWNER}/${REPO_NAME}/contents/${imagePath}`, {
                    method: 'PUT',
                    body: JSON.stringify({
                        message: `Upload image: ${fileName}`,
                        content: base64Content,
                        sha: sha
                    })
                });
                
                const relativeImagePath = `images/${fileName}`;
                insertMarkdown(`![${file.name}](`, `${relativeImagePath})`);
                
                showStatus('Image uploaded!', 'success');
                event.target.value = '';
            } catch (error) {
                showStatus('Failed to upload image: ' + error.message, 'error');
            }
        };
        
        reader.readAsDataURL(file);
    } catch (error) {
        showStatus('Failed to read image: ' + error.message, 'error');
    }
}

document.getElementById('login-button').addEventListener('click', login);
document.getElementById('token-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') login();
});
document.getElementById('fullscreen-button').addEventListener('click', () => {
    const container = document.getElementById('wiki-container');
    const isFullscreen = container.classList.toggle('fullscreen');
    localStorage.setItem('wikiFullscreen', isFullscreen);
});

if (localStorage.getItem('wikiFullscreen') === 'true') {
    document.getElementById('wiki-container').classList.add('fullscreen');
}

document.getElementById('index-button').addEventListener('click', loadAllPagesForSearch);
document.getElementById('logout-button').addEventListener('click', logout);
document.getElementById('edit-button').addEventListener('click', () => {
    if (isMoveMode) {
        cancelMoveMode();
    } else if (isEditMode) {
        cancelEdit();
    } else {
        enterEditMode();
    }
});
document.getElementById('move-button').addEventListener('click', () => {
    if (isMoveMode && currentPage !== pageToMove) {
        executeMove(currentPage);
    } else {
        startMoveMode();
    }
});
document.getElementById('delete-button').addEventListener('click', deletePage);
document.getElementById('new-page-button').addEventListener('click', startNewPage);
document.getElementById('cancel-edit-button-bottom').addEventListener('click', cancelEdit);
document.getElementById('save-button').addEventListener('click', saveEdit);

document.getElementById('markdown-editor').addEventListener('input', () => {
    if (autoSaveTimer) {
        clearTimeout(autoSaveTimer);
    }
    autoSaveTimer = setTimeout(() => {
        saveDraft();
    }, 2000);
});

document.getElementById('markdown-editor').addEventListener('touchend', captureSelection);

document.getElementById('markdown-editor').addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        saveEdit();
    }
});

document.getElementById('wiki-link-close').addEventListener('click', () => {
    closeWikiLinkPicker();
    document.getElementById('markdown-editor').focus();
});

document.getElementById('wiki-link-modal').addEventListener('click', (e) => {
    if (e.target.id === 'wiki-link-modal') {
        closeWikiLinkPicker();
        document.getElementById('markdown-editor').focus();
    }
});

document.getElementById('wiki-link-search').addEventListener('input', () => {
    wikiLinkActiveIndex = 0;
    renderWikiLinkResults();
});

document.getElementById('wiki-link-search').addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        e.preventDefault();
        closeWikiLinkPicker();
        document.getElementById('markdown-editor').focus();
    } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (wikiLinkResults.length === 0) return;
        wikiLinkActiveIndex = Math.min(wikiLinkActiveIndex + 1, wikiLinkResults.length - 1);
        renderWikiLinkResults();
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (wikiLinkResults.length === 0) return;
        wikiLinkActiveIndex = Math.max(wikiLinkActiveIndex - 1, 0);
        renderWikiLinkResults();
    } else if (e.key === 'Enter') {
        e.preventDefault();
        const page = wikiLinkResults[wikiLinkActiveIndex];
        if (page) insertWikiLink(page);
    }
});

document.getElementById('search-box').addEventListener('input', (e) => {
    debouncedSearch(e.target.value);
});

function applySidebarWidth() {
    const sidebar = document.getElementById('sidebar');
    const isMobile = window.innerWidth <= 768;
    const collapsed = sidebar.classList.contains('collapsed');
    if (collapsed) {
        sidebar.style.width = '';
        sidebar.style.height = '';
        sidebar.style.maxHeight = '';
    } else if (isMobile) {
        sidebar.style.width = '';
        const savedHeight = localStorage.getItem('sidebarHeight');
        if (savedHeight) {
            sidebar.style.height = savedHeight + 'px';
            sidebar.style.maxHeight = savedHeight + 'px';
        } else {
            sidebar.style.height = '';
            sidebar.style.maxHeight = '';
        }
    } else {
        sidebar.style.height = '';
        sidebar.style.maxHeight = '';
        const saved = localStorage.getItem('sidebarWidth');
        if (saved) sidebar.style.width = saved + 'px';
    }
}

function setSidebarCollapsed(collapsed) {
    const sidebar = document.getElementById('sidebar');
    const btn = document.getElementById('sidebar-toggle');
    const isMobile = window.innerWidth <= 768;
    sidebar.classList.toggle('collapsed', collapsed);
    btn.textContent = collapsed ? (isMobile ? '▼' : '▶') : (isMobile ? '▲' : '◀');
    localStorage.setItem('sidebarCollapsed', collapsed);
    applySidebarWidth();
}

document.getElementById('collapse-all-button').addEventListener('click', (e) => {
    e.stopPropagation();
    const topLevel = new Set(wikiData.tree);
    expandedParents = new Set([...expandedParents].filter(id => topLevel.has(id)));
    saveExpandedState();
    renderSidebar();
});

document.getElementById('sidebar-toggle').addEventListener('click', () => {
    const sidebar = document.getElementById('sidebar');
    setSidebarCollapsed(!sidebar.classList.contains('collapsed'));
});

document.getElementById('sidebar').addEventListener('click', (e) => {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar.classList.contains('collapsed') || window.innerWidth <= 768) return;
    if (e.target.id === 'sidebar-toggle') return;
    setSidebarCollapsed(false);
});

function applySidebarState() {
    const collapsed = localStorage.getItem('sidebarCollapsed') === 'true';
    setSidebarCollapsed(collapsed);
}

applySidebarState();
window.addEventListener('resize', applySidebarState);

document.getElementById('search-box').addEventListener('input', function() {
    document.getElementById('search-clear').style.display = this.value ? 'block' : 'none';
});

document.getElementById('search-clear').addEventListener('click', () => {
    const searchBox = document.getElementById('search-box');
    searchBox.value = '';
    searchBox.focus();
    document.getElementById('search-clear').style.display = 'none';
    searchPages('');
});

(function() {
    const handle = document.getElementById('resize-handle');
    const sidebar = document.getElementById('sidebar');
    let dragging = false, isVertical = false;
    let startCoord, startSize;

    function startDrag(e) {
        const point = e.touches ? e.touches[0] : e;
        isVertical = window.innerWidth <= 768;
        dragging = true;
        const rect = sidebar.getBoundingClientRect();
        startCoord = isVertical ? point.clientY : point.clientX;
        startSize = isVertical ? rect.height : rect.width;
        handle.classList.add('dragging');
        document.body.style.cursor = isVertical ? 'row-resize' : 'col-resize';
        document.body.style.userSelect = 'none';
        e.preventDefault();
    }

    function moveDrag(e) {
        if (!dragging) return;
        const point = e.touches ? e.touches[0] : e;
        if (isVertical) {
            const maxHeight = window.innerHeight - 200;
            const newHeight = Math.max(80, Math.min(maxHeight, startSize + point.clientY - startCoord));
            sidebar.style.height = newHeight + 'px';
            sidebar.style.maxHeight = newHeight + 'px';
        } else {
            const mainWidth = document.getElementById('main-content').getBoundingClientRect().width;
            const maxWidth = mainWidth - 500 - 8;
            const newWidth = Math.max(200, Math.min(maxWidth, startSize + point.clientX - startCoord));
            sidebar.style.width = newWidth + 'px';
        }
    }

    function endDrag() {
        if (!dragging) return;
        dragging = false;
        handle.classList.remove('dragging');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        const rect = sidebar.getBoundingClientRect();
        if (isVertical) {
            localStorage.setItem('sidebarHeight', rect.height);
        } else {
            localStorage.setItem('sidebarWidth', rect.width);
        }
    }

    handle.addEventListener('mousedown', startDrag);
    handle.addEventListener('touchstart', startDrag, { passive: false });
    document.addEventListener('mousemove', moveDrag);
    document.addEventListener('touchmove', moveDrag, { passive: false });
    document.addEventListener('mouseup', endDrag);
    document.addEventListener('touchend', endDrag);
})();

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isMoveMode) {
        cancelMoveMode();
    }
});

document.addEventListener('visibilitychange', () => {
    if (!document.hidden && wikiData && currentPage) {
        syncCurrentPageWithRemote();
    }
});

window.addEventListener('popstate', async (e) => {
    if (e.state && e.state.pageId && wikiData) {
        isHandlingPopstate = true;
        await loadPage(e.state.pageId, true);
        isHandlingPopstate = false;
    } else if (location.hash) {
        const pageId = location.hash.substring(1);
        if (wikiData && wikiData.pagesById[pageId]) {
            isHandlingPopstate = true;
            await loadPage(pageId, true);
            isHandlingPopstate = false;
        }
    }
});

function updateViewportHeight() {
    const h = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    document.documentElement.style.setProperty('--vh', h + 'px');
}
if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', updateViewportHeight);
}
window.addEventListener('resize', updateViewportHeight);
updateViewportHeight();

const savedToken = getStoredToken();
if (savedToken) {
    document.getElementById('token-input').value = savedToken;
    document.getElementById('login-form').style.display = 'none';
    document.getElementById('loading-message').style.display = 'block';
    login();
}
