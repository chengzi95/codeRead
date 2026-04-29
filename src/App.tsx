import React, { useState, useEffect } from 'react';

interface FileNode {
  name: string;
  type: 'file' | 'folder';
  path: string;
  children?: FileNode[];
}

function App() {
  const [fileTree, setFileTree] = useState<FileNode[]>([]);
  const [currentFile, setCurrentFile] = useState<string | null>(null);
  const [codeContent, setCodeContent] = useState('');
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadFiles();
  }, []);

  const loadFiles = async () => {
    try {
      const modules = import.meta.glob('/src/**/*', {
        eager: false,
        as: 'raw'
      });

      const tree = buildFileTree(modules);
      setFileTree(tree);
    } catch (error) {
      console.error('Failed to load files:', error);
    } finally {
      setLoading(false);
    }
  };

  const buildFileTree = (modules: Record<string, () => Promise<string>>): FileNode[] => {
    const codeExtensions = [
      '.ts', '.tsx', '.js', '.jsx', '.json', '.css', '.scss', '.less',
      '.html', '.md', '.yaml', '.yml', '.toml', '.env', '.gitignore',
      '.vue', '.svelte', '.py', '.java', '.cpp', '.c', '.h', '.go',
      '.rs', '.rb', '.php', '.swift', '.kt', '.cs'
    ];

    const root: FileNode = { name: 'src', type: 'folder', path: 'src', children: [] };
    const folderMap = new Map<string, FileNode>();
    folderMap.set('src', root);

    Object.keys(modules).forEach(filePath => {
      const cleanPath = filePath.replace(/^\//, '');
      const parts = cleanPath.split('/');
      const fileName = parts[parts.length - 1];
      
      const hasCodeExtension = codeExtensions.some(ext => fileName.endsWith(ext));
      if (!hasCodeExtension) {
        return;
      }
      
      let currentPath = 'src';
      let currentFolder = root;

      for (let i = 1; i < parts.length - 1; i++) {
        currentPath = `${currentPath}/${parts[i]}`;
        if (!folderMap.has(currentPath)) {
          const newFolder: FileNode = {
            name: parts[i],
            type: 'folder',
            path: currentPath,
            children: []
          };
          folderMap.set(currentPath, newFolder);
          currentFolder.children!.push(newFolder);
        }
        currentFolder = folderMap.get(currentPath)!;
      }

      currentFolder.children!.push({
        name: fileName,
        type: 'file',
        path: cleanPath
      });
    });

    return root.children || [];
  };

  const showFile = async (name: string, filePath: string) => {
    setCurrentFile(name);
    
    try {
      const modules = import.meta.glob('/src/**/*', {
        eager: false,
        as: 'raw'
      });

      const modulePath = `/${filePath}`;
      if (modules[modulePath]) {
        const content = await modules[modulePath]();
        
        const isGBKFile = filePath.endsWith('.cpp') || filePath.endsWith('.c') || filePath.endsWith('.h');
        
        if (isGBKFile) {
          try {
            const response = await fetch(modulePath);
            const buffer = await response.arrayBuffer();
            const decoder = new TextDecoder('gbk');
            const decoded = decoder.decode(buffer);
            setCodeContent(decoded);
          } catch {
            setCodeContent(content);
          }
        } else {
          setCodeContent(content);
        }
      } else {
        setCodeContent('无法加载文件内容');
      }
    } catch (error) {
      console.error('Failed to load file:', error);
      setCodeContent('加载文件失败');
    }
  };

  const toggleFolder = (folderPath: string) => {
    setExpandedFolders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(folderPath)) {
        newSet.delete(folderPath);
      } else {
        newSet.add(folderPath);
      }
      return newSet;
    });
  };

  const renderTree = (items: FileNode[], indent = 0) => {
    return items.map((item) => (
      <div key={item.path}>
        {item.type === 'folder' ? (
          <div>
            <div 
              onClick={() => toggleFolder(item.path)}
              style={{ 
                cursor: 'pointer', 
                padding: '4px',
                paddingLeft: indent * 20 + 'px',
                userSelect: 'none'
              }}
            >
              {expandedFolders.has(item.path) ? '📂' : ''} {item.name}
            </div>
            {expandedFolders.has(item.path) && item.children && (
              <div>
                {renderTree(item.children, indent + 1)}
              </div>
            )}
          </div>
        ) : (
          <div
            onClick={() => showFile(item.name, item.path)}
            style={{
              cursor: 'pointer',
              padding: '4px',
              paddingLeft: indent * 20 + 'px',
              background: currentFile === item.name ? '#e6f7ff' : '',
              userSelect: 'none'
            }}
          >
            📄 {item.name}
          </div>
        )}
      </div>
    ));
  };

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        fontSize: '18px',
        color: '#666'
      }}>
        加载中...
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* 左侧文件树 */}
      <div style={{
        width: '260px',
        background: '#f5f5f5',
        borderRight: '1px solid #ddd',
        padding: '10px',
        overflowY: 'auto'
      }}>
        <h3>📁 文件目录</h3>
        {renderTree(fileTree)}
      </div>

      {/* 右侧代码区域 */}
      <div style={{
        flex: 1,
        padding: '20px',
        background: '#fff',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {currentFile ? (
          <>
            <div style={{ fontSize: '18px', marginBottom: '10px', fontWeight: 'bold' }}>
               {currentFile}
            </div>
            <pre style={{
              flex: 1,
              background: '#1e1e1e',
              color: '#d4d4d4',
              padding: '20px',
              borderRadius: '8px',
              overflow: 'auto',
              margin: 0,
              fontFamily: 'Consolas, Monaco, "Courier New", monospace',
              fontSize: '14px',
              lineHeight: '1.6',
              whiteSpace: 'pre',
              tabSize: 2
            }}>
              {codeContent}
            </pre>
          </>
        ) : (
          <div style={{ 
            textAlign: 'center', 
            marginTop: '100px', 
            color: '#999',
            fontSize: '16px'
          }}>
            👈 点击左侧文件查看代码
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
