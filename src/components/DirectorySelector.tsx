import React, { useState, useRef } from 'react';

interface FileNode {
  name: string;
  type: 'file' | 'folder';
  path: string;
  fullPath: string;
  children?: FileNode[];
}

interface DirectorySelectorProps {
  onDirectorySelect: (fileTree: FileNode[], files: Record<string, File>, dirName: string) => void;
}

const codeExtensions = [
  '.ts', '.tsx', '.js', '.jsx', '.json', '.css', '.scss', '.less',
  '.html', '.md', '.yaml', '.yml', '.toml', '.env', '.gitignore',
  '.vue', '.svelte', '.py', '.java', '.cpp', '.c', '.h', '.hpp',
  '.go', '.rs', '.rb', '.php', '.swift', '.kt', '.cs', '.sh',
  '.sql', '.xml', '.ini', '.cfg', '.conf', '.properties',
  '.gradle', '.cmake', '.makefile', '.dockerfile',
  '.vue', '.astro', '.mdx'
];

function isCodeFile(fileName: string): boolean {
  const lowerName = fileName.toLowerCase();
  return codeExtensions.some(ext => lowerName.endsWith(ext));
}

const DirectorySelector: React.FC<DirectorySelectorProps> = ({ onDirectorySelect }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedDir, setSelectedDir] = useState<string>('');

  const handleDirectorySelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const fileMap: Record<string, File> = {};
    const folderMap = new Map<string, FileNode>();
    const rootFolders = new Map<string, FileNode>();

    const codeFiles = Array.from(files).filter(file => {
      const path = (file as any).webkitRelativePath || file.name;
      const fileName = path.split('/').pop() || '';
      return isCodeFile(fileName);
    });

    if (codeFiles.length === 0) {
      alert('未找到代码文件');
      return;
    }

    codeFiles.forEach(file => {
      const path = (file as any).webkitRelativePath || file.name;
      fileMap[path] = file;

      const parts = path.split('/');
      const rootName = parts[0];

      if (!rootFolders.has(rootName)) {
        const rootFolder: FileNode = {
          name: rootName,
          type: 'folder',
          path: rootName,
          fullPath: rootName,
          children: []
        };
        rootFolders.set(rootName, rootFolder);
        folderMap.set(rootName, rootFolder);
      }

      let currentPath = rootName;
      let currentFolder = folderMap.get(rootName)!;

      for (let i = 1; i < parts.length - 1; i++) {
        currentPath = `${currentPath}/${parts[i]}`;
        if (!folderMap.has(currentPath)) {
          const newFolder: FileNode = {
            name: parts[i],
            type: 'folder',
            path: currentPath,
            fullPath: currentPath,
            children: []
          };
          folderMap.set(currentPath, newFolder);
          currentFolder.children!.push(newFolder);
        }
        currentFolder = folderMap.get(currentPath)!;
      }

      currentFolder.children!.push({
        name: parts[parts.length - 1],
        type: 'file',
        path: currentPath,
        fullPath: path
      });
    });

    setSelectedDir(rootFolders.size === 1 ? Array.from(rootFolders.keys())[0] : '多个文件夹');
    const dirName = rootFolders.size === 1 ? Array.from(rootFolders.keys())[0] : '多个文件夹';
    onDirectorySelect(Array.from(rootFolders.values()), fileMap, dirName);
  };

  return (
    <div style={{
      padding: '20px',
      textAlign: 'center'
    }}>
      <input
        ref={fileInputRef}
        type="file"
        {...({ webkitdirectory: '', directory: '' } as any)}
        onChange={handleDirectorySelect}
        style={{ display: 'none' }}
      />
      <button
        onClick={() => fileInputRef.current?.click()}
        style={{
          padding: '12px 24px',
          fontSize: '16px',
          background: '#0078d4',
          color: '#fff',
          border: 'none',
          borderRadius: '6px',
          cursor: 'pointer',
          marginBottom: '10px'
        }}
      >
        📁 选择文件夹
      </button>
      {selectedDir && (
        <div style={{ fontSize: '14px', color: '#666' }}>
          已选择: {selectedDir}
        </div>
      )}
    </div>
  );
};

export default DirectorySelector;
