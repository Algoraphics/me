const REPO_OWNER = 'Algoraphics';
const REPO_NAME = 'Vivarium';
const CONTENT_PATH = 'content';

let wikiData = null;
let currentPassword = null;
let currentPage = null;
let githubToken = null;
let originalMarkdown = '';
let deployCheckInterval = null;
let lastDeployTime = 0;
let isEditMode = false;
let imageMeta = {};
let searchIndex = {};
let searchDebounceTimer = null;

async function loadManifest() {
    const response = await fetch('manifest.enc');
    return await response.text();
}

function decryptManifest(encryptedManifest, password) {
    try {
        const decrypted = CryptoJS.AES.decrypt(encryptedManifest, password);
        const manifestStr = decrypted.toString(CryptoJS.enc.Utf8);
        if (!manifestStr) return null;
        return JSON.parse(manifestStr);
    } catch (e) {
        return null;
    }
}

function decryptContent(encryptedContent, password) {
    try {
        const decrypted = CryptoJS.AES.decrypt(encryptedContent, password);
        return decrypted.toString(CryptoJS.enc.Utf8);
    } catch (e) {
        return null;
    }
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

function renderPageItem(pageId, isChild = false) {
    const page = wikiData.pages.find(p => p.id === pageId);
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
    const drafts = JSON.parse(localStorage.getItem('pageDrafts') || '{}');
    drafts[currentPage] = editorContent;
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
        if (href && (href.endsWith('.md') || !href.startsWith('http'))) {
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

async function loadImageMeta() {
    try {
        const response = await fetch('images/meta.enc');
        const encryptedMeta = await response.text();
        const decrypted = CryptoJS.AES.decrypt(encryptedMeta, currentPassword);
        const metaStr = decrypted.toString(CryptoJS.enc.Utf8);
        if (metaStr) {
            imageMeta = JSON.parse(metaStr);
        }
    } catch (error) {
        console.log('No image metadata found');
    }
}

async function decryptAndLoadImages() {
    const images = document.querySelectorAll('#content img');
    
    for (const img of images) {
        const src = img.getAttribute('src');
        if (src && src.includes('../images/')) {
            const imageName = src.split('/').pop();
            
            if (imageMeta[imageName]) {
                img.width = imageMeta[imageName].width;
                img.height = imageMeta[imageName].height;
                img.style.maxWidth = '100%';
                img.style.height = 'auto';
            }
            
            const encryptedPath = src.replace(imageName, imageName + '.enc');
            
            try {
                const response = await fetch(encryptedPath);
                const encryptedData = await response.text();
                const decrypted = CryptoJS.AES.decrypt(encryptedData, currentPassword);
                const base64Image = decrypted.toString(CryptoJS.enc.Utf8);
                
                if (base64Image) {
                    const blob = await fetch('data:image/*;base64,' + base64Image).then(r => r.blob());
                    const blobUrl = URL.createObjectURL(blob);
                    img.src = blobUrl;
                }
            } catch (error) {
                console.error('Failed to decrypt image:', imageName, error);
                img.alt = '[Image failed to decrypt]';
            }
        }
    }
}

function loadPage(pageId) {
    if (isEditMode && currentPage && currentPage !== pageId) {
        saveDraft();
        closeEditMode();
    }
    
    const page = wikiData.pages.find(p => p.id === pageId);
    if (!page) return;
    
    const content = decryptContent(page.content, currentPassword);
    if (!content) {
        alert('Failed to decrypt page content');
        return;
    }
    
    currentPage = pageId;
    document.getElementById('content').innerHTML = content;
    renderSidebar();
    
    setupInternalLinks();
    decryptAndLoadImages();
    
    sessionStorage.setItem('currentPage', pageId);
    checkDeployStatus();
    
    const draft = loadDraft(pageId);
    if (draft) {
        enterEditMode(draft);
    }
}

async function login() {
    const token = document.getElementById('password-input').value;
    const errorMsg = document.getElementById('error-message');
    
    errorMsg.style.display = 'none';
    
    const encryptedManifest = await loadManifest();
    const manifest = decryptManifest(encryptedManifest, token);
    
    if (!manifest) {
        errorMsg.style.display = 'block';
        return;
    }
    
    currentPassword = token;
    githubToken = token;
    wikiData = manifest;
    
    sessionStorage.setItem('wikiPassword', token);
    localStorage.setItem('githubToken', token);
    
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('wiki-container').style.display = 'block';
    
    loadExpandedState();
    renderSidebar();
    buildSearchIndex();
    
    const lastPage = sessionStorage.getItem('currentPage') || 'home';
    await loadImageMeta();
    loadPage(lastPage);
    startDeployPolling();
}

function logout() {
    stopDeployPolling();
    sessionStorage.removeItem('wikiPassword');
    sessionStorage.removeItem('currentPage');
    currentPassword = null;
    wikiData = null;
    currentPage = null;
    
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('wiki-container').style.display = 'none';
    document.getElementById('password-input').value = '';
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

function checkGitHubToken() {
    githubToken = localStorage.getItem('githubToken');
}

function promptForToken() {
    const token = prompt('Enter your GitHub Personal Access Token:\n\nCreate one at: https://github.com/settings/tokens\n\nNeeds: repo permissions');
    if (token) {
        githubToken = token;
        localStorage.setItem('githubToken', token);
        return true;
    }
    return false;
}

async function enterEditMode(draftContent = null) {
    const page = wikiData.pages.find(p => p.id === currentPage);
    const filePath = `${CONTENT_PATH}/${currentPage}.md`;
    
    try {
        if (!draftContent) {
            const data = await githubAPI(`/repos/${REPO_OWNER}/${REPO_NAME}/contents/${filePath}`);
            originalMarkdown = atob(data.content);
            document.getElementById('markdown-editor').value = originalMarkdown;
        } else {
            document.getElementById('markdown-editor').value = draftContent;
        }
        
        document.getElementById('view-mode').style.display = 'none';
        document.getElementById('edit-mode').style.display = 'block';
        document.getElementById('edit-button').textContent = 'View';
        isEditMode = true;
    } catch (error) {
        alert('Failed to load file for editing: ' + error.message + '\n\nMake sure your token has repo access.');
    }
}

function closeEditMode() {
    document.getElementById('view-mode').style.display = 'block';
    document.getElementById('edit-mode').style.display = 'none';
    document.getElementById('edit-button').textContent = 'Edit';
    document.getElementById('status-message').className = '';
    document.getElementById('status-message').textContent = '';
    isEditMode = false;
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

async function saveEdit() {
    const newContent = document.getElementById('markdown-editor').value;
    const commitMsg = `Update ${currentPage}`;
    const filePath = `${CONTENT_PATH}/${currentPage}.md`;
    
    if (newContent === originalMarkdown) {
        showStatus('No changes to save', 'error');
        return;
    }
    
    try {
        document.getElementById('save-button').disabled = true;
        showStatus('Saving to GitHub...', 'success');
        
        const currentData = await githubAPI(`/repos/${REPO_OWNER}/${REPO_NAME}/contents/${filePath}`);
        
        await githubAPI(`/repos/${REPO_OWNER}/${REPO_NAME}/contents/${filePath}`, {
            method: 'PUT',
            body: JSON.stringify({
                message: commitMsg,
                content: btoa(newContent),
                sha: currentData.sha
            })
        });
        
        setEditTime(currentPage);
        clearDraft(currentPage);
        checkDeployStatus();
        
        showStatus('Saved! Wiki will rebuild in ~1 minute. Edit button will re-enable when deploy completes.', 'success');
        
        setTimeout(() => {
            closeEditMode();
            document.getElementById('save-button').disabled = false;
        }, 2000);
    } catch (error) {
        showStatus('Failed to save: ' + error.message, 'error');
        document.getElementById('save-button').disabled = false;
    }
}

function showStatus(message, type = '') {
    const statusEl = document.getElementById('status-message');
    statusEl.textContent = message;
    statusEl.className = type;
}

function getEditTimes() {
    const stored = localStorage.getItem('pageEditTimes');
    return stored ? JSON.parse(stored) : {};
}

function setEditTime(pageId) {
    const editTimes = getEditTimes();
    editTimes[pageId] = Date.now();
    localStorage.setItem('pageEditTimes', JSON.stringify(editTimes));
}

async function checkDeployStatus() {
    try {
        const response = await fetch('deploy-timestamp.json?t=' + Date.now());
        const data = await response.json();
        lastDeployTime = data.deployTime;
        
        if (!currentPage) return;
        
        const editTimes = getEditTimes();
        const lastEditTime = editTimes[currentPage] || 0;
        
        const deployPending = lastEditTime > lastDeployTime;
        const editButton = document.getElementById('edit-button');
        
        if (deployPending) {
            editButton.disabled = true;
            editButton.textContent = 'Deploy pending...';
        } else {
            if (document.getElementById('edit-mode').style.display !== 'block') {
                editButton.disabled = false;
                editButton.textContent = 'Edit';
            }
        }
    } catch (error) {
        console.log('Failed to check deploy status:', error);
    }
}

function startDeployPolling() {
    if (deployCheckInterval) {
        clearInterval(deployCheckInterval);
    }
    checkDeployStatus();
    deployCheckInterval = setInterval(checkDeployStatus, 10000);
}

function stopDeployPolling() {
    if (deployCheckInterval) {
        clearInterval(deployCheckInterval);
        deployCheckInterval = null;
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

function buildSearchIndex() {
    console.log('Building search index...');
    searchIndex = {};
    
    wikiData.pages.forEach(page => {
        const decryptedContent = decryptContent(page.content, currentPassword);
        const plainText = decryptedContent ? decryptedContent.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ') : '';
        
        searchIndex[page.id] = {
            title: page.title,
            plainText: plainText,
            lowerTitle: page.title.toLowerCase(),
            lowerText: plainText.toLowerCase()
        };
    });
    
    console.log('Search index built');
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
        results.forEach(({ page, snippet }) => {
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
    
    if (!githubToken) {
        promptForToken();
        if (!githubToken) return;
    }
    
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
            const imagePath = `images/${fileName}`;
            
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
                
                const relativeImagePath = `../images/${fileName}`;
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
document.getElementById('password-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') login();
});
document.getElementById('logout-button').addEventListener('click', logout);
document.getElementById('edit-button').addEventListener('click', () => {
    if (isEditMode) {
        cancelEdit();
    } else {
        enterEditMode();
    }
});
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

const savedPassword = sessionStorage.getItem('wikiPassword');
if (savedPassword) {
    document.getElementById('password-input').value = savedPassword;
    login();
}

checkGitHubToken();

