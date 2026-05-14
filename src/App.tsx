import { useState, useEffect, useRef } from 'react';
import CodeHighlight from './components/CodeHighlight';
import DirectorySelector from './components/DirectorySelector';
import { getLanguageFromFileName } from './utils/languageMapping';

interface FileNode {
  name: string;
  type: 'file' | 'folder';
  path: string;
  fullPath: string;
  children?: FileNode[];
}

interface OpenedDirectory {
  name: string;
  fileTree: FileNode[];
  fileMap: Record<string, File>;
}

interface SearchResult {
  filePath: string;
  fileName: string;
  lineNumber: number;
  lineContent: string;
  fileMap: Record<string, File>;
}

interface AIConfig {
  provider: 'openrouter' | 'openai' | 'gemini' | 'custom' | 'mock';
  apiKey: string;
  apiUrl: string;
  model: string;
}

interface AIMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

function App() {
  const [openedDirs, setOpenedDirs] = useState<OpenedDirectory[]>([]);
  const [currentFile, setCurrentFile] = useState<string | null>(null);
  const [currentFilePath, setCurrentFilePath] = useState<string>('');
  const [codeContent, setCodeContent] = useState('');
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [highlightLine, setHighlightLine] = useState<number | undefined>(undefined);
  const [showAI, setShowAI] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [aiConfig, setAiConfig] = useState<AIConfig>({
    provider: 'openrouter',
    apiKey: '',
    apiUrl: '',
    model: 'minimax/minimax-m2.5:free'
  });

  useEffect(() => {
    if (aiConfig.provider === 'openrouter') {
      setAiConfig(prev => ({ ...prev, model: 'minimax/minimax-m2.5:free' }));
    } else if (aiConfig.provider === 'gemini') {
      setAiConfig(prev => ({ ...prev, model: 'gemini-2.0-flash' }));
    } else if (aiConfig.provider === 'openai') {
      setAiConfig(prev => ({ ...prev, model: 'gpt-3.5-turbo' }));
    }
  }, [aiConfig.provider]);
  const [aiMessages, setAiMessages] = useState<AIMessage[]>([]);
  const [aiInput, setAiInput] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [selectedCode, setSelectedCode] = useState('');

  const handleDirectorySelect = (tree: FileNode[], files: Record<string, File>, dirName: string) => {
    const newDir: OpenedDirectory = {
      name: dirName,
      fileTree: tree,
      fileMap: files
    };

    setOpenedDirs(prev => {
      const exists = prev.some(d => d.name === dirName);
      if (exists) return prev;
      return [...prev, newDir];
    });

    setCurrentFile(null);
    setCodeContent('');
  };

  const closeDirectory = (dirName: string) => {
    setOpenedDirs(prev => {
      const newDirs = prev.filter(d => d.name !== dirName);
      if (newDirs.length === 0) {
        setCurrentFile(null);
        setCodeContent('');
      }
      return newDirs;
    });

    setExpandedFolders(prev => {
      const newSet = new Set(prev);
      prev.forEach(key => {
        if (key.startsWith(dirName + '/') || key === dirName) {
          newSet.delete(key);
        }
      });
      return newSet;
    });
  };

  const showFile = async (name: string, fullPath: string, fileMap: Record<string, File>) => {
    setCurrentFile(name);
    setCurrentFilePath(fullPath);
    setHighlightLine(undefined);

    const file = fileMap[fullPath];
    if (!file) {
      setCodeContent('无法加载文件内容');
      return;
    }

    try {
      const isGBKFile = fullPath.endsWith('.cpp') || fullPath.endsWith('.c') || fullPath.endsWith('.h');

      if (isGBKFile) {
        try {
          const buffer = await file.arrayBuffer();
          const decoder = new TextDecoder('gbk');
          const decoded = decoder.decode(buffer);
          setCodeContent(decoded);
        } catch {
          const text = await file.text();
          setCodeContent(text);
        }
      } else {
        const text = await file.text();
        setCodeContent(text);
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

  const performSearch = async () => {
    if (!searchQuery.trim() || openedDirs.length === 0) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    const results: SearchResult[] = [];
    const query = searchQuery.toLowerCase();

    for (const dir of openedDirs) {
      const allFiles = Object.entries(dir.fileMap);

      for (const [filePath, file] of allFiles) {
        try {
          const isGBKFile = filePath.endsWith('.cpp') || filePath.endsWith('.c') || filePath.endsWith('.h');
          let content = '';

          if (isGBKFile) {
            try {
              const buffer = await file.arrayBuffer();
              const decoder = new TextDecoder('gbk');
              content = decoder.decode(buffer);
            } catch {
              content = await file.text();
            }
          } else {
            content = await file.text();
          }

          const lines = content.split('\n');
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].toLowerCase().includes(query)) {
              const fileName = filePath.split('/').pop() || filePath;
              results.push({
                filePath,
                fileName,
                lineNumber: i + 1,
                lineContent: lines[i],
                fileMap: dir.fileMap
              });
            }
          }
        } catch (error) {
          console.error('Failed to search in file:', filePath, error);
        }
      }
    }

    setSearchResults(results);
    setIsSearching(false);
  };

  useEffect(() => {
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
    }
    if (!searchQuery.trim() || openedDirs.length === 0) {
      setSearchResults([]);
      return;
    }
    searchTimerRef.current = setTimeout(async () => {
      setIsSearching(true);
      const results: SearchResult[] = [];
      const query = searchQuery.toLowerCase();

      for (const dir of openedDirs) {
        const allFiles = Object.entries(dir.fileMap);
        for (const [filePath, file] of allFiles) {
          try {
            const isGBKFile = filePath.endsWith('.cpp') || filePath.endsWith('.c') || filePath.endsWith('.h');
            let content = '';
            if (isGBKFile) {
              try {
                const buffer = await file.arrayBuffer();
                const decoder = new TextDecoder('gbk');
                content = decoder.decode(buffer);
              } catch {
                content = await file.text();
              }
            } else {
              content = await file.text();
            }
            const lines = content.split('\n');
            for (let i = 0; i < lines.length; i++) {
              if (lines[i].toLowerCase().includes(query)) {
                const fileName = filePath.split('/').pop() || filePath;
                results.push({ filePath, fileName, lineNumber: i + 1, lineContent: lines[i], fileMap: dir.fileMap });
              }
            }
          } catch (error) {
            console.error('Failed to search in file:', filePath, error);
          }
        }
      }
      setSearchResults(results);
      setIsSearching(false);
    }, 300);
    return () => {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }
    };
  }, [searchQuery, openedDirs]);

  const handleSearchResultClick = async (result: SearchResult) => {
    setCurrentFile(result.fileName);
    setCurrentFilePath(result.filePath);
    setHighlightLine(result.lineNumber);

    try {
      const file = result.fileMap[result.filePath];
      if (!file) {
        setCodeContent('无法加载文件内容');
        return;
      }

      const isGBKFile = result.filePath.endsWith('.cpp') || result.filePath.endsWith('.c') || result.filePath.endsWith('.h');

      if (isGBKFile) {
        try {
          const buffer = await file.arrayBuffer();
          const decoder = new TextDecoder('gbk');
          const decoded = decoder.decode(buffer);
          setCodeContent(decoded);
        } catch {
          const text = await file.text();
          setCodeContent(text);
        }
      } else {
        const text = await file.text();
        setCodeContent(text);
      }
    } catch (error) {
      console.error('Failed to load file:', error);
      setCodeContent('加载文件失败');
    }
  };

  const callAI = async (messages: AIMessage[], retryCount = 0): Promise<string> => {
    if (aiConfig.provider === 'mock') {
      await new Promise(resolve => setTimeout(resolve, 1000));
      return "这是一个模拟的 AI 回复。\n\n在实际使用中，你需要配置真实的 AI API（如 OpenAI）来获取代码解释。\n\n当前选中的代码：\n```\n" + selectedCode.substring(0, 200) + "\n```";
    }

    let apiUrl: string;
    let headers: Record<string, string>;
    let body: any;

    if (aiConfig.provider === 'openrouter') {
      apiUrl = 'https://openrouter.ai/api/v1/chat/completions';
      headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${aiConfig.apiKey}`,
        'HTTP-Referer': window.location.origin,
        'X-Title': 'Code Reader'
      };
      const isFreeModel = aiConfig.model.includes(':free');
      body = {
        model: aiConfig.model,
        messages: isFreeModel ? [messages[messages.length - 1]] : messages.map(m => ({ role: m.role, content: m.content }))
      };
    } else if (aiConfig.provider === 'openai') {
      apiUrl = 'https://api.openai.com/v1/chat/completions';
      headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${aiConfig.apiKey}`
      };
      body = {
        model: aiConfig.model,
        messages: messages.map(m => ({ role: m.role, content: m.content }))
      };
    } else if (aiConfig.provider === 'gemini') {
      const apiKey = aiConfig.apiKey;
      apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${aiConfig.model}:generateContent?key=${apiKey}`;
      headers = {
        'Content-Type': 'application/json'
      };
      body = {
        contents: messages.map(m => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }]
        }))
      };
    } else {
      apiUrl = aiConfig.apiUrl;
      headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${aiConfig.apiKey}`
      };
      body = {
        model: aiConfig.model,
        messages: messages.map(m => ({ role: m.role, content: m.content }))
      };
    }

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      if (response.status === 429 && retryCount < 3) {
        const waitTime = Math.pow(2, retryCount) * 2000;
        await new Promise(resolve => setTimeout(resolve, waitTime));
        return callAI(messages, retryCount + 1);
      }
      throw new Error(`AI API 错误: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    if (aiConfig.provider === 'gemini') {
      return data.candidates[0].content.parts[0].text;
    }

    return data.choices[0].message.content;
  };

  const handleAISubmit = async (overrideInput?: string) => {
    const inputText = overrideInput || aiInput;
    if (!inputText.trim()) return;

    const userMessage: AIMessage = { role: 'user', content: inputText };
    const newMessages = [...aiMessages, userMessage];
    setAiMessages(newMessages);
    setAiInput('');
    setIsAiLoading(true);

    try {
      const contextMessage: AIMessage = {
        role: 'user',
        content: selectedCode 
          ? `当前选中的代码：\n\`\`\`\n${selectedCode}\n\`\`\`\n\n${inputText}`
          : inputText
      };

      const aiResponse = await callAI([...newMessages, contextMessage]);
      setAiMessages(prev => [...prev, { role: 'assistant', content: aiResponse }]);
    } catch (error) {
      setAiMessages(prev => [...prev, { 
        role: 'assistant', 
        content: `错误: ${error instanceof Error ? error.message : '未知错误'}` 
      }]);
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleCodeSelect = (code: string) => {
    setSelectedCode(code);
  };

  const explainSelectedCode = () => {
    if (!selectedCode) return;
    setShowAI(true);
    setAiInput('请解释这段代码的作用');
  };

  const renderTree = (items: FileNode[], indent = 0, fileMap: Record<string, File>, dirName: string) => {
    return items.map((item) => {
      const folderName = item.name || item.path.split('/').pop() || '文件夹';
      return (
      <div key={item.fullPath}>
        {item.type === 'folder' ? (
          <div>
            <div
              onClick={() => toggleFolder(item.path)}
              style={{
                cursor: 'pointer',
                padding: '4px',
                paddingLeft: indent * 20 + 'px',
                userSelect: 'none',
                color: '#000',
                fontSize: '14px',
                whiteSpace: 'nowrap'
              }}
            >
              {expandedFolders.has(item.path) ? '' : '📁 '}{folderName}
            </div>
            {expandedFolders.has(item.path) && item.children && (
              <div>
                {renderTree(item.children, indent + 1, fileMap, dirName)}
              </div>
            )}
          </div>
        ) : (
          <div
            onClick={() => showFile(item.name, item.fullPath, fileMap)}
            style={{
              cursor: 'pointer',
              padding: '4px',
              paddingLeft: indent * 20 + 'px',
              background: currentFile === item.name ? '#e6f7ff' : '',
              userSelect: 'none'
            }}
          >
             {item.name}
          </div>
        )}
      </div>
    )});
  };

  if (openedDirs.length === 0) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: '#fff'
      }}>
        <h2 style={{ marginBottom: '20px', color: '#333' }}>Code Reader</h2>
        <DirectorySelector onDirectorySelect={handleDirectorySelect} />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <div style={{
        width: '260px',
        background: '#f5f5f5',
        borderRight: '1px solid #ddd',
        display: 'flex',
        flexDirection: 'column'
      }}>
        <div style={{
          padding: '10px',
          borderBottom: '1px solid #ddd'
        }}>
          <DirectorySelector onDirectorySelect={handleDirectorySelect} />
        </div>
        
        <div style={{
          padding: '10px',
          borderBottom: '1px solid #ddd'
        }}>
          <div style={{ display: 'flex', gap: '5px' }}>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && performSearch()}
              placeholder="Search..."
              style={{
                flex: 1,
                padding: '6px 10px',
                fontSize: '13px',
                border: '1px solid #ccc',
                borderRadius: '4px',
                outline: 'none'
              }}
            />
            <button
              onClick={performSearch}
              disabled={isSearching}
              style={{
                padding: '6px 12px',
                fontSize: '13px',
                background: '#0078d4',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: isSearching ? 'not-allowed' : 'pointer',
                opacity: isSearching ? 0.6 : 1
              }}
            >
              {isSearching ? '搜索中...' : '搜索'}
            </button>
          </div>
        </div>

        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '0'
        }}>
          {(searchQuery.trim() || searchResults.length > 0) && (
            <div style={{
              background: '#f5f5f5',
            }}>
              <div style={{
                padding: '8px 12px',
                fontSize: '11px',
                color: '#666',
                borderBottom: '1px solid #ddd',
                background: '#e8e8e8',
                fontWeight: 'bold',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <span>搜索结果 {searchResults.length > 0 ? `(${searchResults.length} 条)` : ''}</span>
                {isSearching && <span style={{ color: '#0078d4' }}>搜索中...</span>}
              </div>
              {searchResults.length === 0 && searchQuery.trim() && !isSearching && (
                <div style={{
                  padding: '20px 12px',
                  textAlign: 'center',
                  color: '#999',
                  fontSize: '12px'
                }}>
                  未找到匹配结果
                </div>
              )}
              {searchResults.length > 0 && (() => {
                const grouped: Record<string, SearchResult[]> = {};
                searchResults.forEach(r => {
                  if (!grouped[r.filePath]) grouped[r.filePath] = [];
                  grouped[r.filePath].push(r);
                });
                return Object.entries(grouped).map(([filePath, results]) => (
                  <div key={filePath}>
                    <div style={{
                      padding: '6px 12px',
                      fontSize: '12px',
                      color: '#333',
                      background: '#e0e0e0',
                      borderBottom: '1px solid #ddd',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontWeight: 'bold'
                    }}>
                      <span style={{ fontSize: '14px' }}>📄</span>
                      <span>{filePath}</span>
                      <span style={{ color: '#888', fontWeight: 'normal' }}>({results.length})</span>
                    </div>
                    {results.map((result, idx) => (
                      <div
                        key={`${filePath}-${idx}`}
                        onClick={() => handleSearchResultClick(result)}
                        style={{
                          padding: '4px 12px 4px 28px',
                          cursor: 'pointer',
                          fontSize: '12px',
                          color: '#333',
                          borderBottom: '1px solid #eee',
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '8px'
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = '#e3f2fd')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        <span style={{
                          color: '#999',
                          fontSize: '11px',
                          minWidth: '30px',
                          textAlign: 'right',
                          paddingTop: '1px'
                        }}>
                          {result.lineNumber}
                        </span>
                        <span style={{
                          flex: 1,
                          whiteSpace: 'pre',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          fontFamily: 'Consolas, Monaco, monospace'
                        }}>
                          {(() => {
                            const text = result.lineContent;
                            const query = searchQuery;
                            if (!query) return text;
                            const lowerText = text.toLowerCase();
                            const lowerQuery = query.toLowerCase();
                            const index = lowerText.indexOf(lowerQuery);
                            if (index === -1) return text;
                            return (
                              <>
                                {text.substring(0, index)}
                                <span style={{
                                  background: '#ff9800',
                                  color: '#fff',
                                  borderRadius: '2px',
                                  padding: '0 2px',
                                  fontWeight: 'bold'
                                }}>
                                  {text.substring(index, index + query.length)}
                                </span>
                                {text.substring(index + query.length)}
                              </>
                            );
                          })()}
                        </span>
                      </div>
                    ))}
                  </div>
                ));
              })()}
            </div>
          )}

          {openedDirs.map(dir => (
            <div key={dir.name} style={{ marginBottom: '10px' }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '4px 8px',
                background: '#e0e0e0',
                borderRadius: '4px',
                marginBottom: '4px'
              }}>
                <span style={{ fontWeight: 'bold', fontSize: '14px' }}>
                  📁 {dir.name}
                </span>
                <span
                  onClick={() => closeDirectory(dir.name)}
                  style={{
                    cursor: 'pointer',
                    fontSize: '16px',
                    color: '#666',
                    padding: '0 4px'
                  }}
                >
                  ×
                </span>
              </div>
              {renderTree(dir.fileTree, 0, dir.fileMap, dir.name)}
            </div>
          ))}
        </div>
      </div>

      <div style={{
        flex: 1,
        background: '#fff',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}>
        {currentFile ? (
          <>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              padding: '10px 20px',
              borderBottom: '1px solid #eee'
            }}>
              <div style={{ fontSize: '18px', fontWeight: 'bold' }}>
                {currentFile}
              </div>
              <button
                onClick={() => setShowAI(!showAI)}
                style={{
                  padding: '6px 16px',
                  fontSize: '13px',
                  background: showAI ? '#0078d4' : '#f0f0f0',
                  color: showAI ? '#fff' : '#333',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                🤖 AI 助手
              </button>
            </div>
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <CodeHighlight
                  code={codeContent}
                  language={getLanguageFromFileName(currentFilePath)}
                  searchQuery={searchQuery}
                  highlightLine={highlightLine}
                  onCodeSelect={handleCodeSelect}
                />
                {selectedCode && (
                  <div style={{
                    padding: '8px 20px',
                    background: '#f0f7ff',
                    borderTop: '1px solid #d0e0f0',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px'
                  }}>
                    <span style={{ fontSize: '12px', color: '#666' }}>
                      已选中 {selectedCode.length} 字符
                    </span>
                    <button
                      onClick={explainSelectedCode}
                      style={{
                        padding: '4px 12px',
                        fontSize: '12px',
                        background: '#0078d4',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer'
                      }}
                    >
                      解释选中代码
                    </button>
                    <button
                      onClick={() => setSelectedCode('')}
                      style={{
                        padding: '4px 12px',
                        fontSize: '12px',
                        background: '#f0f0f0',
                        color: '#333',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer'
                      }}
                    >
                      清除选中
                    </button>
                  </div>
                )}
              </div>
              
              {showAI && (
                <div style={{
                  width: '400px',
                  borderLeft: '1px solid #ddd',
                  display: 'flex',
                  flexDirection: 'column',
                  background: '#fafafa'
                }}>
                  <div style={{
                    padding: '12px 16px',
                    borderBottom: '1px solid #ddd',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <span style={{ fontWeight: 'bold', fontSize: '14px' }}>AI 助手</span>
                    <button
                      onClick={() => setShowAI(false)}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '18px',
                        color: '#666'
                      }}
                    >
                      ×
                    </button>
                  </div>
                  
                  <div style={{
                    padding: '10px 16px',
                    borderBottom: '1px solid #ddd',
                    display: 'flex',
                    gap: '8px',
                    alignItems: 'center',
                    fontSize: '12px'
                  }}>
                    <select
                      value={aiConfig.provider}
                      onChange={(e) => setAiConfig(prev => ({ ...prev, provider: e.target.value as any }))}
                      style={{
                        padding: '4px 8px',
                        fontSize: '12px',
                        border: '1px solid #ccc',
                        borderRadius: '4px'
                      }}
                    >
                      <option value="mock">Mock 模式</option>
                      <option value="openrouter">OpenRouter (免费模型)</option>
                      <option value="gemini">Google Gemini (免费)</option>
                      <option value="openai">OpenAI</option>
                      <option value="custom">自定义</option>
                    </select>
                    {aiConfig.provider !== 'mock' && aiConfig.provider !== 'puter' && (
                      <>
                        <input
                          type="password"
                          placeholder="API Key"
                          value={aiConfig.apiKey}
                          onChange={(e) => setAiConfig(prev => ({ ...prev, apiKey: e.target.value }))}
                          style={{
                            flex: 1,
                            padding: '4px 8px',
                            fontSize: '12px',
                            border: '1px solid #ccc',
                            borderRadius: '4px'
                          }}
                        />
                        {aiConfig.provider === 'openrouter' && (
                          <a
                            href="https://openrouter.ai/keys"
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              fontSize: '11px',
                              color: '#0078d4',
                              textDecoration: 'none',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            获取Key
                          </a>
                        )}
                        {aiConfig.provider === 'gemini' && (
                          <a
                            href="https://aistudio.google.com/apikey"
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              fontSize: '11px',
                              color: '#0078d4',
                              textDecoration: 'none',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            获取免费Key
                          </a>
                        )}
                        {aiConfig.provider === 'custom' && (
                          <input
                            type="text"
                            placeholder="API URL"
                            value={aiConfig.apiUrl}
                            onChange={(e) => setAiConfig(prev => ({ ...prev, apiUrl: e.target.value }))}
                            style={{
                              flex: 1,
                              padding: '4px 8px',
                              fontSize: '12px',
                              border: '1px solid #ccc',
                              borderRadius: '4px'
                            }}
                          />
                        )}
                      </>
                    )}
                  </div>

                  <div style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: '16px'
                  }}>
                    {aiMessages.length === 0 && (
                      <div style={{
                        textAlign: 'center',
                        color: '#999',
                        marginTop: '40px',
                        fontSize: '13px'
                      }}>
                        输入问题或选中代码后点击"解释选中代码"
                      </div>
                    )}
                    {aiMessages.map((msg, index) => (
                      <div
                        key={index}
                        style={{
                          marginBottom: '12px',
                          padding: '10px 14px',
                          borderRadius: '8px',
                          background: msg.role === 'user' ? '#0078d4' : '#fff',
                          color: msg.role === 'user' ? '#fff' : '#333',
                          fontSize: '13px',
                          lineHeight: '1.6',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
                        }}
                      >
                        {msg.content}
                      </div>
                    ))}
                    {isAiLoading && (
                      <div style={{
                        padding: '10px 14px',
                        color: '#666',
                        fontSize: '13px'
                      }}>
                        AI 思考中...
                      </div>
                    )}
                  </div>

                  <div style={{
                    padding: '12px 16px',
                    borderTop: '1px solid #ddd',
                    display: 'flex',
                    gap: '8px'
                  }}>
                    <input
                      type="text"
                      value={aiInput}
                      onChange={(e) => setAiInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAISubmit(); } }}
                      placeholder="输入问题..."
                      style={{
                        flex: 1,
                        padding: '8px 12px',
                        fontSize: '13px',
                        border: '1px solid #ccc',
                        borderRadius: '4px',
                        outline: 'none'
                      }}
                    />
                    <button
                      onClick={() => handleAISubmit()}
                      disabled={isAiLoading}
                      style={{
                        padding: '8px 16px',
                        fontSize: '13px',
                        background: '#0078d4',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: isAiLoading ? 'not-allowed' : 'pointer',
                        opacity: isAiLoading ? 0.6 : 1
                      }}
                    >
                      发送
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div style={{
            textAlign: 'center',
            marginTop: '100px',
            color: '#999',
            fontSize: '16px'
          }}>
             点击左侧文件查看代码
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
