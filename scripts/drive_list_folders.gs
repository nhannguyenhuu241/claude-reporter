/**
 * Google Apps Script - List Drive Folder Contents
 * Deploy as Web App with "Anyone" access
 */

function doGet(e) {
  return handleRequest(e);
}

function doPost(e) {
  return handleRequest(e);
}

function handleRequest(e) {
  try {
    const params = e.parameter;
    const action = params.action || 'list';
    const folderId = params.folderId;

    if (!folderId) {
      return jsonResponse({ error: 'Missing folderId parameter' });
    }

    let result;

    switch (action) {
      case 'list':
        // List immediate children of folder
        result = listFolderContents(folderId);
        break;
      case 'tree':
        // Get full tree structure (limited depth)
        const depth = parseInt(params.depth) || 2;
        result = getFolderTree(folderId, depth);
        break;
      case 'download':
        // Download file content as base64
        const fileId = params.fileId;
        if (!fileId) {
          result = { error: 'Missing fileId parameter' };
        } else {
          result = downloadFileAsBase64(fileId);
        }
        break;
      default:
        result = { error: 'Unknown action' };
    }

    return jsonResponse(result);

  } catch (error) {
    return jsonResponse({ error: error.toString() });
  }
}

function listFolderContents(folderId) {
  const folder = DriveApp.getFolderById(folderId);
  const items = [];

  // Get subfolders
  const folders = folder.getFolders();
  while (folders.hasNext()) {
    const f = folders.next();
    items.push({
      id: f.getId(),
      name: f.getName(),
      type: 'folder',
      url: f.getUrl(),
      lastUpdated: f.getLastUpdated().toISOString()
    });
  }

  // Get files
  const files = folder.getFiles();
  while (files.hasNext()) {
    const file = files.next();
    items.push({
      id: file.getId(),
      name: file.getName(),
      type: 'file',
      mimeType: file.getMimeType(),
      size: file.getSize(),
      url: file.getUrl(),
      lastUpdated: file.getLastUpdated().toISOString()
    });
  }

  // Sort: folders first, then by name
  items.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return {
    folderId: folderId,
    folderName: folder.getName(),
    items: items,
    count: items.length
  };
}

function getFolderTree(folderId, maxDepth, currentDepth = 0) {
  const folder = DriveApp.getFolderById(folderId);
  const tree = {
    id: folder.getId(),
    name: folder.getName(),
    type: 'folder',
    children: []
  };

  if (currentDepth >= maxDepth) {
    return tree;
  }

  // Get subfolders
  const folders = folder.getFolders();
  while (folders.hasNext()) {
    const f = folders.next();
    tree.children.push(getFolderTree(f.getId(), maxDepth, currentDepth + 1));
  }

  // Get files (only at leaf level or always?)
  const files = folder.getFiles();
  while (files.hasNext()) {
    const file = files.next();
    tree.children.push({
      id: file.getId(),
      name: file.getName(),
      type: 'file',
      mimeType: file.getMimeType()
    });
  }

  // Sort children
  tree.children.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return tree;
}

function downloadFileAsBase64(fileId) {
  try {
    const file = DriveApp.getFileById(fileId);
    const blob = file.getBlob();
    const bytes = blob.getBytes();

    // Convert to base64
    const base64 = Utilities.base64Encode(bytes);

    return {
      success: true,
      fileName: file.getName(),
      mimeType: blob.getContentType(),
      size: bytes.length,
      content: base64
    };
  } catch (error) {
    return {
      success: false,
      error: error.toString()
    };
  }
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
