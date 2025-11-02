const REPO_OWNER = 'Algoraphics';
const REPO_NAME = 'Vivarium';
const CONTENT_PATH = 'content';
const IMAGES_PATH = 'images';

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

const md = window.markdownit ? window.markdownit({
    html: false,
    linkify: true,
    typographer: true
}) : null;

if (!md) {
    console.error('markdown-it library not loaded');
    document.addEventListener('DOMContentLoaded', () => {
        document.body.innerHTML = '<div style="color: red; padding: 20px;">Error: markdown-it library failed to load</div>';
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
        ...options,
        headers: {
            'Authorization': `token ${githubToken}`,
            'Accept': 'application/vnd.github.v3+json',
            ...options.headers
        }
    });
    
    if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status}`);
    }
    
    return response.json();
}

async function loadWikiFromGitHub() {
    const tree = await githubAPI(`/repos/${REPO_OWNER}/${REPO_NAME}/git/trees/main?recursive=1`);
    
    const markdownFiles = tree.tree
        .filter(item => item.path.startsWith(CONTENT_PATH + '/') && item.path.endsWith('.md'))
        .sort((a, b) => a.path.localeCompare(b.path));
    
    console.log(`Found ${markdownFiles.length} pages`);
    
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
            sha: file.sha,
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
    
    console.log('Page tree built');
    return { pages, pagesById, tree: tree_root };
}

async function fetchPageContent(pageId) {
    const page = wikiData.pagesById[pageId];
    if (!page || page.loaded) return page;
    
    try {
        const blob = await githubAPI(`/repos/${REPO_OWNER}/${REPO_NAME}/git/blobs/${page.sha}`);
        const markdown = atob(blob.content.replace(/\n/g, ''));
        const title = markdown.match(/^#\s+(.+)$/m)?.[1] || pageId.split('/').pop();
        
        page.markdown = markdown;
        page.title = title;
        page.loaded = true;
        
        localStorage.setItem('wikiDataCache', JSON.stringify(wikiData));
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

function renderSidebar() {
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
    const page = wikiData.pagesById[currentPage];
    
    const drafts = JSON.parse(localStorage.getItem('pageDrafts') || '{}');
    drafts[currentPage] = {
        content: editorContent,
        baseSha: page.sha,
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

async function loadImages() {
    const images = document.querySelectorAll('#content img[data-src]');
    
    for (const img of images) {
        const dataSrc = img.getAttribute('data-src');
        if (dataSrc && dataSrc.includes('images/')) {
            const imageName = dataSrc.split('/').pop();
            const imagePath = `${IMAGES_PATH}/${imageName}`;
            
            try {
                const contentsData = await githubAPI(`/repos/${REPO_OWNER}/${REPO_NAME}/contents/${imagePath}`);
                
                let blobSha;
                if (contentsData.encoding === 'base64' && contentsData.content) {
                    const base64Image = contentsData.content.replace(/[\n\r]/g, '');
                    const byteCharacters = atob(base64Image);
                    const byteNumbers = new Array(byteCharacters.length);
                    for (let i = 0; i < byteCharacters.length; i++) {
                        byteNumbers[i] = byteCharacters.charCodeAt(i);
                    }
                    const byteArray = new Uint8Array(byteNumbers);
                    const blob = new Blob([byteArray], { type: 'image/jpeg' });
                    const blobUrl = URL.createObjectURL(blob);
                    img.src = blobUrl;
                } else {
                    blobSha = contentsData.sha;
                    const blobData = await githubAPI(`/repos/${REPO_OWNER}/${REPO_NAME}/git/blobs/${blobSha}`);
                    
                    const base64Image = blobData.content.replace(/[\n\r]/g, '');
                    const byteCharacters = atob(base64Image);
                    const byteNumbers = new Array(byteCharacters.length);
                    for (let i = 0; i < byteCharacters.length; i++) {
                        byteNumbers[i] = byteCharacters.charCodeAt(i);
                    }
                    const byteArray = new Uint8Array(byteNumbers);
                    const blob = new Blob([byteArray], { type: 'image/jpeg' });
                    const blobUrl = URL.createObjectURL(blob);
                    img.src = blobUrl;
                }
                
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

async function loadPage(pageId) {
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
    }
    
    let htmlContent = md.render(page.markdown);
    
    htmlContent = htmlContent.replace(/<img src="images\//g, '<img data-src="images/');
    
    document.getElementById('content').innerHTML = htmlContent;
    renderSidebar();
    
    setTimeout(() => {
        const activeLink = document.querySelector('.page-link.active, .child-link.active');
        if (activeLink) {
            activeLink.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }, 100);
    
    if (isMoveMode) {
        updateMoveButtons();
    }
    
    setupInternalLinks();
    await loadImages();
    
    sessionStorage.setItem('currentPage', pageId);
    
    const draft = loadDraft(pageId);
    if (draft && !isMoveMode) {
        enterEditMode(draft.content || draft, draft);
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
        const cachedData = localStorage.getItem('wikiDataCache');
        
        if (cachedData) {
            const cached = JSON.parse(cachedData);
            const cachedPagesById = {};
            cached.pages.forEach(p => cachedPagesById[p.id] = p);
            
            freshData.pages.forEach(freshPage => {
                const cachedPage = cachedPagesById[freshPage.id];
                if (cachedPage && cachedPage.loaded && cachedPage.sha === freshPage.sha) {
                    freshPage.markdown = cachedPage.markdown;
                    freshPage.title = cachedPage.title;
                    freshPage.loaded = true;
                }
            });
            
            console.log('Loaded fresh tree, merged with cached content');
        } else {
            console.log('Loaded from GitHub');
        }
        
        wikiData = freshData;
        localStorage.setItem('wikiDataCache', JSON.stringify(wikiData));
        
        sessionStorage.setItem('githubToken', token);
        
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('wiki-container').style.display = 'block';
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
        loadPage(lastPage);
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
    sessionStorage.removeItem('githubToken');
    sessionStorage.removeItem('currentPage');
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

async function enterEditMode(draftContent = null, draftObj = null) {
    const page = wikiData.pagesById[currentPage];
    
    if (!page.loaded && !draftContent) {
        await fetchPageContent(currentPage);
    }
    
    let hasConflict = false;
    if (draftObj && draftObj.baseSha && draftObj.baseSha !== page.sha) {
        hasConflict = true;
        showStatus('⚠️ Warning: Page was updated since this draft was created. Save may overwrite remote changes.', 'error');
    }
    
    if (!draftContent) {
        originalMarkdown = page.markdown;
        document.getElementById('markdown-editor').value = page.markdown;
    } else {
        document.getElementById('markdown-editor').value = draftContent;
    }
    
    document.getElementById('view-mode').style.display = 'none';
    document.getElementById('edit-mode').style.display = 'block';
    document.getElementById('edit-button').textContent = 'View';
    isEditMode = true;
    
    if (hasConflict) {
        document.getElementById('save-button').style.background = '#cc6600';
    }
}

function closeEditMode() {
    document.getElementById('view-mode').style.display = 'block';
    document.getElementById('edit-mode').style.display = 'none';
    document.getElementById('edit-button').textContent = 'Edit';
    document.getElementById('save-button').style.background = '';
    document.getElementById('status-message').className = '';
    document.getElementById('status-message').textContent = '';
    isEditMode = false;
    isNewPage = false;
}

function startNewPage() {
    isNewPage = true;
    originalMarkdown = '';
    
    document.getElementById('markdown-editor').value = '# \n\n';
    document.getElementById('view-mode').style.display = 'none';
    document.getElementById('edit-mode').style.display = 'block';
    document.getElementById('edit-button').textContent = 'View';
    isEditMode = true;
    updateMoveButtons();
    
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
        deleteBtn.style.display = 'inline-block';
        moveBtn.style.display = 'inline-block';
        moveBtn.textContent = 'Move';
        newPageBtn.style.display = 'inline-block';
        editBtn.textContent = isEditMode ? 'View' : 'Edit';
    }
}

async function executeMove(newParentId) {
    const oldPath = `${CONTENT_PATH}/${pageToMove}.md`;
    const oldParts = pageToMove.split('/');
    const pageName = oldParts[oldParts.length - 1];
    const newPageId = newParentId ? `${newParentId}/${pageName}` : pageName;
    const newPath = `${CONTENT_PATH}/${newPageId}.md`;
    
    if (oldPath === newPath) {
        showStatus('Page is already in this location', 'error');
        cancelMoveMode();
        return;
    }
    
    const moveBtn = document.getElementById('move-button');
    const oldBtnText = moveBtn.textContent;
    
    try {
        moveBtn.textContent = 'Placing...';
        moveBtn.disabled = true;
        showStatus('Moving page to new location...', 'success');
        
        const oldData = await githubAPI(`/repos/${REPO_OWNER}/${REPO_NAME}/contents/${oldPath}`);
        const content = atob(oldData.content.replace(/\n/g, ''));
        
        await githubAPI(`/repos/${REPO_OWNER}/${REPO_NAME}/contents/${newPath}`, {
            method: 'PUT',
            body: JSON.stringify({
                message: `Move ${pageToMove} to ${newPageId}`,
                content: btoa(content)
            })
        });
        
        showStatus('Removing from old location...', 'success');
        
        await githubAPI(`/repos/${REPO_OWNER}/${REPO_NAME}/contents/${oldPath}`, {
            method: 'DELETE',
            body: JSON.stringify({
                message: `Delete old location of ${pageToMove}`,
                sha: oldData.sha
            })
        });
        
        showStatus('Updating local data...', 'success');
        
        const page = wikiData.pagesById[pageToMove];
        const oldParentId = page.parentId;
        const newParentId_actual = newParentId;
        
        if (oldParentId && wikiData.pagesById[oldParentId]) {
            wikiData.pagesById[oldParentId].children = wikiData.pagesById[oldParentId].children.filter(id => id !== pageToMove);
        } else {
            wikiData.tree = wikiData.tree.filter(id => id !== pageToMove);
        }
        
        delete wikiData.pagesById[pageToMove];
        
        page.id = newPageId;
        page.parentId = newParentId_actual;
        wikiData.pagesById[newPageId] = page;
        
        if (newParentId_actual && wikiData.pagesById[newParentId_actual]) {
            wikiData.pagesById[newParentId_actual].children.push(newPageId);
        } else {
            wikiData.tree.push(newPageId);
        }
        
        const pageIndex = wikiData.pages.findIndex(p => p.id === pageToMove || p.id === newPageId);
        if (pageIndex !== -1) {
            wikiData.pages[pageIndex] = page;
        }
        
        localStorage.setItem('wikiDataCache', JSON.stringify(wikiData));
        
        currentPage = newPageId;
        expandAncestors(newPageId);
        cancelMoveMode();
        renderSidebar();
        loadPage(currentPage);
        
        moveBtn.textContent = oldBtnText;
        moveBtn.disabled = false;
        showStatus('Page moved!', 'success');
    } catch (error) {
        moveBtn.textContent = oldBtnText;
        moveBtn.disabled = false;
        showStatus('Failed to move: ' + error.message, 'error');
        cancelMoveMode();
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
    
    try {
        showStatus('Deleting page...', 'success');
        
        const filePath = `${CONTENT_PATH}/${currentPage}.md`;
        const fileData = await githubAPI(`/repos/${REPO_OWNER}/${REPO_NAME}/contents/${filePath}`);
        
        await githubAPI(`/repos/${REPO_OWNER}/${REPO_NAME}/contents/${filePath}`, {
            method: 'DELETE',
            body: JSON.stringify({
                message: `Delete ${currentPage}`,
                sha: fileData.sha
            })
        });
        
        localStorage.removeItem('wikiDataCache');
        wikiData = await loadWikiFromGitHub();
        localStorage.setItem('wikiDataCache', JSON.stringify(wikiData));
        updateSearchIndex();
        
        const newPage = page.parentId || wikiData.tree[0] || 'home';
        currentPage = null;
        renderSidebar();
        loadPage(newPage);
        
        showStatus('Page deleted!', 'success');
    } catch (error) {
        showStatus('Failed to delete: ' + error.message, 'error');
    }
}

function cancelEdit() {
    const currentContent = document.getElementById('markdown-editor').value;
    
    if (currentContent !== originalMarkdown) {
        if (!confirm('You have unsaved changes. Are you sure you want to discard them?')) {
            return;
        }
    }
    
    if (currentPage && !isNewPage) {
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

async function checkFilenameExists(basePath, filename) {
    try {
        await githubAPI(`/repos/${REPO_OWNER}/${REPO_NAME}/contents/${basePath}/${filename}.md`);
        return true;
    } catch (e) {
        return false;
    }
}

async function getUniqueFilename(basePath, filename) {
    let finalName = filename;
    let counter = 1;
    
    while (await checkFilenameExists(basePath, finalName)) {
        finalName = `${filename}-${counter}`;
        counter++;
    }
    
    return finalName;
}

async function saveEdit() {
    const newContent = document.getElementById('markdown-editor').value;
    
    if (!newContent.trim()) {
        showStatus('Page cannot be empty', 'error');
        return;
    }
    
    const draft = loadDraft(currentPage);
    const page = wikiData.pagesById[currentPage];
    
    if (draft && draft.baseSha && draft.baseSha !== page.sha && !isNewPage) {
        if (!confirm('⚠️ WARNING: This page was updated since your draft was created.\n\nSaving will OVERWRITE the remote changes.\n\nAre you sure you want to continue?')) {
            return;
        }
    }
    
    try {
        document.getElementById('save-button').disabled = true;
        showStatus('Saving to GitHub...', 'success');
        
        let filePath, commitMsg, sha;
        
        if (isNewPage) {
            const parentPath = currentPage ? `${CONTENT_PATH}/${currentPage}` : CONTENT_PATH;
            const baseName = generateFilename(newContent);
            const uniqueName = await getUniqueFilename(parentPath, baseName);
            const newPageId = currentPage ? `${currentPage}/${uniqueName}` : uniqueName;
            
            filePath = `${CONTENT_PATH}/${newPageId}.md`;
            commitMsg = `Create ${newPageId}`;
            sha = null;
        } else {
            filePath = `${CONTENT_PATH}/${currentPage}.md`;
            commitMsg = `Update ${currentPage}`;
            
            if (newContent === originalMarkdown) {
                showStatus('No changes to save', 'error');
                document.getElementById('save-button').disabled = false;
                return;
            }
            
            const currentData = await githubAPI(`/repos/${REPO_OWNER}/${REPO_NAME}/contents/${filePath}`);
            sha = currentData.sha;
        }
        
        await githubAPI(`/repos/${REPO_OWNER}/${REPO_NAME}/contents/${filePath}`, {
            method: 'PUT',
            body: JSON.stringify({
                message: commitMsg,
                content: btoa(newContent),
                sha: sha
            })
        });
        
        localStorage.removeItem('wikiDataCache');
        
        wikiData = await loadWikiFromGitHub();
        localStorage.setItem('wikiDataCache', JSON.stringify(wikiData));
        updateSearchIndex();
        
        if (isNewPage) {
            const newPageId = filePath.replace(`${CONTENT_PATH}/`, '').replace(/\.md$/, '');
            currentPage = newPageId;
        } else {
            wikiData.pagesById[currentPage].markdown = newContent;
            const title = newContent.match(/^#\s+(.+)$/m)?.[1] || currentPage.split('/').pop();
            wikiData.pagesById[currentPage].title = title;
        }
        
        originalMarkdown = newContent;
        clearDraft(currentPage);
        isNewPage = false;
        
        showStatus('Saved!', 'success');
        
        setTimeout(() => {
            closeEditMode();
            renderSidebar();
            loadPage(currentPage);
            document.getElementById('save-button').disabled = false;
        }, 1500);
    } catch (error) {
        showStatus('Failed to save: ' + error.message, 'error');
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
            
            results.push({ page, snippet });
        }
    });
    
    const resultsContainer = document.getElementById('search-results');
    resultsContainer.innerHTML = '';
    
    if (results.length > 0) {
        const limitedResults = results.slice(0, 5);
        const hasMore = results.length > 5;
        
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
            moreDiv.textContent = `...and ${results.length - 5} more results`;
            resultsContainer.appendChild(moreDiv);
        }
        
        resultsContainer.classList.add('active');
    } else {
        resultsContainer.innerHTML = '<div style="color: #999; padding: 10px;">No results found</div>';
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
                
                const imagePath = `images/${fileName}`;
                insertMarkdown(`![${file.name}](`, `${imagePath})`);
                
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
document.getElementById('cancel-edit-button').addEventListener('click', cancelEdit);
document.getElementById('save-button').addEventListener('click', saveEdit);

document.getElementById('markdown-editor').addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        saveEdit();
    }
});

document.getElementById('search-box').addEventListener('input', (e) => {
    debouncedSearch(e.target.value);
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isMoveMode) {
        cancelMoveMode();
    }
});

async function checkForUpdatesOnFocus() {
    if (!wikiData || !githubToken) return;
    
    try {
        const freshData = await loadWikiFromGitHub();
        const currentPageData = wikiData.pagesById[currentPage];
        const freshPageData = freshData.pagesById[currentPage];
        
        if (currentPageData && freshPageData && currentPageData.sha !== freshPageData.sha) {
            showStatus('⚠️ This page was updated remotely. Reload to see changes.', 'error');
            
            currentPageData.sha = freshPageData.sha;
            localStorage.setItem('wikiDataCache', JSON.stringify(wikiData));
        }
    } catch (error) {
        console.log('Background sync check failed:', error);
    }
}

document.addEventListener('visibilitychange', () => {
    if (!document.hidden && wikiData) {
        checkForUpdatesOnFocus();
    }
});

const savedToken = sessionStorage.getItem('githubToken');
if (savedToken) {
    document.getElementById('token-input').value = savedToken;
    document.getElementById('login-form').style.display = 'none';
    document.getElementById('loading-message').style.display = 'block';
    login();
}
