import React, { useEffect, useRef, useState, useCallback } from 'react';
import hljs from 'highlight.js';
import 'highlight.js/styles/vs2015.css';

interface CodeHighlightProps {
  code: string;
  language: string;
  searchQuery?: string;
  highlightLine?: number;
  onCodeSelect?: (code: string) => void;
}

interface FoldRegion {
  startLine: number;
  endLine: number;
  kind: string;
}

const CodeHighlight: React.FC<CodeHighlightProps> = ({ code, language, searchQuery, highlightLine, onCodeSelect }) => {
  const codeRef = useRef<HTMLElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const foldGutterRef = useRef<HTMLDivElement>(null);
  const [foldedRegions, setFoldedRegions] = useState<Set<number>>(new Set());
  const [foldRegions, setFoldRegions] = useState<FoldRegion[]>([]);

  const detectFoldRegions = useCallback((code: string): FoldRegion[] => {
    const lines = code.split('\n');
    const regions: FoldRegion[] = [];
    const stack: { line: number; col: number; kind: string }[] = [];
    let blockCommentStart: number | null = null;
    
    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx];
      let inString = false;
      let stringChar = '';
      let inLineComment = false;
      let inBlockComment = false;
      
      for (let col = 0; col < line.length; col++) {
        const char = line[col];
        const prevChar = col > 0 ? line[col - 1] : '';
        const nextChar = col < line.length - 1 ? line[col + 1] : '';
        
        if (inLineComment) continue;
        
        if (inBlockComment) {
          if (char === '*' && nextChar === '/') {
            inBlockComment = false;
            col++;
            if (blockCommentStart !== null && lineIdx > blockCommentStart) {
              regions.push({
                startLine: blockCommentStart,
                endLine: lineIdx,
                kind: 'comment'
              });
              blockCommentStart = null;
            }
          }
          continue;
        }
        
        if (!inString && char === '/' && nextChar === '/') {
          inLineComment = true;
          col++;
          continue;
        }
        
        if (!inString && char === '/' && nextChar === '*') {
          inBlockComment = true;
          col++;
          blockCommentStart = lineIdx;
          continue;
        }
        
        if (inString) {
          if (char === stringChar && prevChar !== '\\') {
            inString = false;
          }
          continue;
        }
        
        if (char === '"' || char === "'" || char === '`') {
          inString = true;
          stringChar = char;
          continue;
        }
        
        if (char === '{') {
          let kind = 'block';
          const trimmedBefore = line.substring(0, col).trim();
          
          if (/^(function|def)\s/.test(trimmedBefore) || /=>\s*$/.test(trimmedBefore)) {
            kind = 'function';
          } else if (/^(class|interface|struct|type|enum|namespace)\s/.test(trimmedBefore)) {
            kind = 'declaration';
          } else if (/^(if|else|for|while|do|switch|try|catch)\b/.test(trimmedBefore)) {
            kind = 'control';
          } else if (/^(public|private|protected)\s/.test(trimmedBefore)) {
            kind = 'method';
          }
          
          stack.push({ line: lineIdx, col, kind });
        } else if (char === '}') {
          if (stack.length > 0) {
            const openBrace = stack.pop()!;
            if (lineIdx > openBrace.line) {
              regions.push({
                startLine: openBrace.line,
                endLine: lineIdx,
                kind: openBrace.kind
              });
            }
          }
        }
      }
    }
    
    regions.sort((a, b) => a.startLine - b.startLine);
    return regions;
  }, []);

  useEffect(() => {
    const regions = detectFoldRegions(code);
    setFoldRegions(regions);
  }, [code, detectFoldRegions]);

  const toggleFold = useCallback((startLine: number) => {
    setFoldedRegions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(startLine)) {
        newSet.delete(startLine);
      } else {
        newSet.add(startLine);
      }
      return newSet;
    });
  }, []);

  const getHiddenLines = useCallback((): Set<number> => {
    const hidden = new Set<number>();
    for (const startLine of foldedRegions) {
      const region = foldRegions.find(r => r.startLine === startLine);
      if (region) {
        for (let i = region.startLine + 1; i < region.endLine; i++) {
          hidden.add(i);
        }
      }
    }
    return hidden;
  }, [foldedRegions, foldRegions]);

  useEffect(() => {
    if (!searchQuery || !containerRef.current) return;
    
    const escapedQuery = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedQuery})`, 'gi');
    
    const walker = document.createTreeWalker(containerRef.current, NodeFilter.SHOW_TEXT);
    const textNodes: Text[] = [];
    let node: Node | null;
    while (node = walker.nextNode()) {
      textNodes.push(node as Text);
    }
    
    textNodes.forEach(textNode => {
      const text = textNode.textContent || '';
      if (regex.test(text)) {
        const fragment = document.createDocumentFragment();
        const parts = text.split(regex);
        parts.forEach(part => {
          const matchRegex = new RegExp(`^${escapedQuery}$`, 'i');
          if (matchRegex.test(part)) {
            const span = document.createElement('span');
            span.style.background = '#6e3b00';
            span.style.color = '#fff';
            span.style.borderRadius = '2px';
            span.style.padding = '0 2px';
            span.textContent = part;
            fragment.appendChild(span);
          } else {
            fragment.appendChild(document.createTextNode(part));
          }
        });
        textNode.parentNode?.replaceChild(fragment, textNode);
      }
    });
  }, [code, language, searchQuery]);

  useEffect(() => {
    if (!highlightLine || !containerRef.current) return;
    
    const targetLineIdx = highlightLine - 1;
    const lineElement = containerRef.current.querySelector(`[data-line="${targetLineIdx}"]`);
    if (lineElement) {
      (lineElement as HTMLElement).style.background = '#264f78';
      setTimeout(() => {
        lineElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 50);
    }
    const allLines = containerRef.current.querySelectorAll('.code-line');
    allLines.forEach((el, index) => {
      if (index !== targetLineIdx) {
        (el as HTMLElement).style.background = '';
      }
    });
  }, [highlightLine, code]);

  useEffect(() => {
    const hiddenLines = getHiddenLines();
    const allLineElements = containerRef.current?.querySelectorAll('.code-line');
    const allLineNumberElements = lineNumbersRef.current?.querySelectorAll('.line-number');
    
    allLineElements?.forEach((el, index) => {
      const shouldBeHidden = hiddenLines.has(index);
      (el as HTMLElement).style.display = shouldBeHidden ? 'none' : '';
    });

    allLineNumberElements?.forEach((el, index) => {
      const shouldBeHidden = hiddenLines.has(index);
      (el as HTMLElement).style.display = shouldBeHidden ? 'none' : '';
    });
  }, [foldedRegions, foldRegions, getHiddenLines]);

  useEffect(() => {
    const syncScroll = () => {
      if (lineNumbersRef.current && containerRef.current) {
        lineNumbersRef.current.scrollTop = containerRef.current.scrollTop;
      }
    };
    containerRef.current?.addEventListener('scroll', syncScroll);
    return () => {
      containerRef.current?.removeEventListener('scroll', syncScroll);
    };
  }, []);

  const handleSelectionChange = useCallback(() => {
    if (!onCodeSelect) return;
    
    const selection = window.getSelection();
    if (selection && selection.toString().trim()) {
      const selectedText = selection.toString();
      if (containerRef.current && containerRef.current.contains(selection.anchorNode)) {
        onCodeSelect(selectedText);
      }
    } else {
      onCodeSelect('');
    }
  }, [onCodeSelect]);

  const lines = code.split('\n');
  const hiddenLines = getHiddenLines();

  return (
    <div style={{
      display: 'flex',
      flex: 1,
      background: '#1e1e1e',
      borderRadius: '8px',
      fontSize: '14px',
      lineHeight: '1.6',
      fontFamily: 'Consolas, Monaco, "Courier New", monospace',
      textAlign: 'left',
      overflow: 'hidden'
    }}>
      <div 
        ref={lineNumbersRef}
        style={{
          padding: '20px 0',
          background: '#2d2d30',
          color: '#858585',
          textAlign: 'right',
          userSelect: 'none',
          minWidth: '50px',
          borderRight: '1px solid #3e3e42',
          overflow: 'hidden',
        }}
      >
        {lines.map((_, index) => (
          <div 
            key={index} 
            className="line-number"
            data-line-num={index + 1}
            style={{ 
              padding: '0 10px',
              height: '22.4px',
              lineHeight: '22.4px',
            }}
          >
            {index + 1}
          </div>
        ))}
      </div>
      <div 
        ref={containerRef}
        onMouseUp={handleSelectionChange}
        style={{
          margin: 0,
          flex: 1,
          fontFamily: 'Consolas, Monaco, "Courier New", monospace',
          fontSize: '14px',
          lineHeight: '1.6',
          tabSize: 2,
          textAlign: 'left',
          overflow: 'auto',
          position: 'relative'
        }}
      >
        {lines.map((lineContent, index) => {
          const region = foldRegions.find(r => r.startLine === index);
          const isFolded = region ? foldedRegions.has(index) : false;
          
          return (
            <div
              key={index}
              className="code-line"
              data-line={index}
              style={{
                height: '22.4px',
                lineHeight: '22.4px',
                display: 'flex',
                paddingLeft: '10px',
              }}
            >
              <span
                onClick={(e) => { e.stopPropagation(); region && toggleFold(index); }}
                style={{
                  width: '16px',
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: region ? 'pointer' : 'default',
                  color: isFolded ? '#4ec9b0' : '#858585',
                  fontSize: '10px',
                  userSelect: 'none',
                }}
              >
                {region ? (isFolded ? '▶' : '▼') : ' '}
              </span>
              <span 
                ref={index === 0 ? codeRef : undefined}
                style={{ flex: 1, whiteSpace: 'pre', cursor: 'text' }}
                dangerouslySetInnerHTML={{ 
                  __html: hljs.highlight(lineContent || ' ', { language }).value 
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default CodeHighlight;
