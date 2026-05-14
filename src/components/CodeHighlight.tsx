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

interface BracketHighlight {
  line: number;
  col: number;
  matchLine: number;
  matchCol: number;
}

const CodeHighlight: React.FC<CodeHighlightProps> = ({ code, language, searchQuery, highlightLine, onCodeSelect }) => {
  const codeRef = useRef<HTMLElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const foldGutterRef = useRef<HTMLDivElement>(null);
  const [foldedRegions, setFoldedRegions] = useState<Set<number>>(new Set());
  const [foldRegions, setFoldRegions] = useState<FoldRegion[]>([]);
  const [bracketHighlight, setBracketHighlight] = useState<BracketHighlight | null>(null);
  const justDoubleClicked = useRef(false);

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

  useEffect(() => {
    const existing = containerRef.current?.querySelectorAll('.bracket-overlay, .bracket-line-overlay');
    existing?.forEach(el => el.remove());
    
    if (!bracketHighlight || !containerRef.current) return;
    
    requestAnimationFrame(() => {
      const allLines = containerRef.current!.querySelectorAll('.code-line');
      const startLineEl = allLines[bracketHighlight.line] as HTMLElement;
      const endLineEl = allLines[bracketHighlight.matchLine] as HTMLElement;
      if (!startLineEl || !endLineEl) return;

      const codeSpan = startLineEl.querySelector('span[style*="flex: 1"]') || startLineEl.lastElementChild;
      if (!codeSpan) return;

      const codeSpanRect = codeSpan.getBoundingClientRect();
      const containerRect = containerRef.current!.getBoundingClientRect();
      const charWidth = codeSpanRect.width / (codeSpan.textContent?.length || 1);

      const startLeft = codeSpanRect.left - containerRect.left + bracketHighlight.col * charWidth;
      const endLeft = codeSpanRect.left - containerRect.left + bracketHighlight.matchCol * charWidth;
      const lineTop = startLineEl.getBoundingClientRect().top - containerRect.top;
      const lineBottom = endLineEl.getBoundingClientRect().bottom - containerRect.top;

      const bracketW = charWidth + 2;
      const bracketH = startLineEl.getBoundingClientRect().height;

      const positions = [
        { left: startLeft, top: lineTop, w: bracketW, h: bracketH },
        { left: endLeft, top: lineBottom - bracketH, w: bracketW, h: bracketH }
      ];

      positions.forEach((pos, i) => {
        const overlay = document.createElement('div');
        overlay.className = 'bracket-overlay';
        overlay.style.cssText = `
          position: absolute;
          left: ${pos.left}px;
          top: ${pos.top}px;
          width: ${pos.w}px;
          height: ${pos.h}px;
          background: rgba(38, 79, 120, 0.6);
          border-radius: 2px;
          pointer-events: none;
          z-index: 10;
        `;
        containerRef.current!.appendChild(overlay);
      });

      const lineLeft = Math.min(startLeft, endLeft) + bracketW / 2 - 1;
      const lineOverlay = document.createElement('div');
      lineOverlay.className = 'bracket-line-overlay';
      lineOverlay.style.cssText = `
        position: absolute;
        left: ${lineLeft}px;
        top: ${lineTop + bracketH}px;
        width: 2px;
        height: ${lineBottom - lineTop - bracketH * 2}px;
        border-left: 2px dashed rgba(38, 79, 120, 0.6);
        pointer-events: none;
        z-index: 10;
      `;
      containerRef.current!.appendChild(lineOverlay);
    });
  }, [bracketHighlight]);

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

  const findMatchingBracket = useCallback((lineIdx: number, colIdx: number, lines: string[]): BracketHighlight | null => {
    const line = lines[lineIdx];
    if (!line || colIdx < 0 || colIdx >= line.length) return null;
    
    const char = line[colIdx];
    const pairs: Record<string, string> = { '{': '}', '(': ')', '[': ']' };
    const reversePairs: Record<string, string> = { '}': '{', ')': '(', ']': '[' };
    
    const isOpening = pairs[char];
    const isClosing = reversePairs[char];
    
    if (!isOpening && !isClosing) return null;
    
    if (isOpening) {
      const targetChar = pairs[char];
      let depth = 1;
      let inString = false;
      let stringChar = '';
      let inLineComment = false;
      let inBlockComment = false;
      
      for (let l = lineIdx; l < lines.length; l++) {
        const currentLine = lines[l];
        const startCol = l === lineIdx ? colIdx + 1 : 0;
        
        for (let c = startCol; c < currentLine.length; c++) {
          const ch = currentLine[c];
          const prevCh = c > 0 ? currentLine[c - 1] : '';
          const nextCh = c < currentLine.length - 1 ? currentLine[c + 1] : '';
          
          if (inLineComment) continue;
          
          if (inBlockComment) {
            if (ch === '*' && nextCh === '/') {
              inBlockComment = false;
              c++;
            }
            continue;
          }
          
          if (!inString && ch === '/' && nextCh === '/') {
            inLineComment = true;
            c++;
            continue;
          }
          
          if (!inString && ch === '/' && nextCh === '*') {
            inBlockComment = true;
            c++;
            continue;
          }
          
          if (inString) {
            if (ch === stringChar && prevCh !== '\\') {
              inString = false;
            }
            continue;
          }
          
          if (ch === '"' || ch === '`') {
            inString = true;
            stringChar = ch;
            continue;
          }
          
          if (ch === "'" && prevCh !== '*' && prevCh !== ')' && prevCh !== ']' && prevCh !== '}' && prevCh !== '+' && prevCh !== '-' && prevCh !== '/' && prevCh !== '%' && prevCh !== '^' && prevCh !== '&' && prevCh !== '|' && prevCh !== '=' && prevCh !== '<' && prevCh !== '>' && prevCh !== '!' && prevCh !== ',' && prevCh !== ';' && prevCh !== '(' && prevCh !== '[' && prevCh !== '{' && prevCh !== ':' && prevCh !== '?' && prevCh !== '~' && prevCh !== ' ' && prevCh !== '\t' && prevCh !== '\n' && prevCh !== '\r' && prevCh !== '') {
            inString = true;
            stringChar = ch;
            continue;
          }
          
          if (ch === char) depth++;
          else if (ch === targetChar) {
            depth--;
            if (depth === 0) {
              return { line: lineIdx, col: colIdx, matchLine: l, matchCol: c };
            }
          }
        }
      }
    } else {
      const targetChar = reversePairs[char];
      let depth = 1;
      let inString = false;
      let stringChar = '';
      let inLineComment = false;
      let inBlockComment = false;
      
      for (let l = lineIdx; l >= 0; l--) {
        const currentLine = lines[l];
        const endCol = l === lineIdx ? colIdx - 1 : currentLine.length - 1;
        
        for (let c = endCol; c >= 0; c--) {
          const ch = currentLine[c];
          const prevCh = c > 0 ? currentLine[c - 1] : '';
          const nextCh = c < currentLine.length - 1 ? currentLine[c + 1] : '';
          
          if (inLineComment) continue;
          
          if (inBlockComment) {
            if (ch === '*' && nextCh === '/') {
              inBlockComment = false;
            }
            continue;
          }
          
          if (!inString && ch === '/' && nextCh === '/') {
            inLineComment = true;
            continue;
          }
          
          if (!inString && ch === '/' && prevCh === '*') {
            inBlockComment = true;
            continue;
          }
          
          if (inString) {
            if (ch === stringChar && prevCh !== '\\') {
              inString = false;
            }
            continue;
          }
          
          if (ch === '"' || ch === '`') {
            inString = true;
            stringChar = ch;
            continue;
          }
          
          if (ch === "'" && prevCh !== '*' && prevCh !== ')' && prevCh !== ']' && prevCh !== '}' && prevCh !== '+' && prevCh !== '-' && prevCh !== '/' && prevCh !== '%' && prevCh !== '^' && prevCh !== '&' && prevCh !== '|' && prevCh !== '=' && prevCh !== '<' && prevCh !== '>' && prevCh !== '!' && prevCh !== ',' && prevCh !== ';' && prevCh !== '(' && prevCh !== '[' && prevCh !== '{' && prevCh !== ':' && prevCh !== '?' && prevCh !== '~' && prevCh !== ' ' && prevCh !== '\t' && prevCh !== '\n' && prevCh !== '\r' && prevCh !== '') {
            inString = true;
            stringChar = ch;
            continue;
          }
          
          if (ch === char) depth++;
          else if (ch === targetChar) {
            depth--;
            if (depth === 0) {
              return { line: lineIdx, col: colIdx, matchLine: l, matchCol: c };
            }
          }
        }
      }
    }
    
    return null;
  }, []);

  const handleCodeDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    
    console.log('Double click triggered');
    
    const codeSpan = e.currentTarget as HTMLElement;
    const codeLine = codeSpan.closest('.code-line');
    if (!codeLine) return;
    
    const lineIdx = parseInt(codeLine.getAttribute('data-line') || '-1');
    console.log('Line index:', lineIdx);
    if (lineIdx < 0) return;
    
    let colIdx = -1;
    
    const caretPos = (document as any).caretPositionFromPoint?.(e.clientX, e.clientY);
    if (caretPos && caretPos.offsetNode.nodeType === Node.TEXT_NODE) {
      const textNode = caretPos.offsetNode as Text;
      colIdx = caretPos.offset;
      
      let globalCol = 0;
      let found = false;
      const walker = document.createTreeWalker(codeSpan, NodeFilter.SHOW_TEXT);
      let node: Node | null;
      while (node = walker.nextNode()) {
        if (node === textNode) {
          globalCol += colIdx;
          found = true;
          break;
        }
        globalCol += (node.textContent || '').length;
      }
      if (!found) return;
      colIdx = globalCol;
    } else {
      const range = (document as any).caretRangeFromPoint?.(e.clientX, e.clientY);
      if (range && range.startContainer.nodeType === Node.TEXT_NODE) {
        const textNode = range.startContainer as Text;
        colIdx = range.startOffset;
        
        let globalCol = 0;
        let found = false;
        const walker = document.createTreeWalker(codeSpan, NodeFilter.SHOW_TEXT);
        let node: Node | null;
        while (node = walker.nextNode()) {
          if (node === textNode) {
            globalCol += colIdx;
            found = true;
            break;
          }
          globalCol += (node.textContent || '').length;
        }
        if (!found) return;
        colIdx = globalCol;
      } else {
        console.log('No caret position found');
        return;
      }
    }
    
    console.log('Column index:', colIdx);
    
    const textContent = codeSpan.textContent || '';
    console.log('Line content:', textContent);
    if (colIdx < 0 || colIdx >= textContent.length) return;
    
    const char = textContent[colIdx];
    console.log('Character at position:', char);
    
    const pairs: Record<string, string> = { '{': '}', '(': ')', '[': ']' };
    const reversePairs: Record<string, string> = { '}': '{', ')': '(', ']': '[' };
    
    if (!pairs[char] && !reversePairs[char]) {
      console.log('Not a bracket character');
      return;
    }
    
    const lines = code.split('\n');
    const match = findMatchingBracket(lineIdx, colIdx, lines);
    console.log('Match found:', match);
    setBracketHighlight(match);
  }, [code, findMatchingBracket]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const container = containerRef.current;
      if (container && !container.contains(e.target as Node)) {
        setBracketHighlight(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    
    const handleScroll = () => {
      const existing = container.querySelectorAll('.bracket-overlay, .bracket-line-overlay');
      existing.forEach(el => el.remove());
      
      if (!bracketHighlight) return;
      
      const allLines = container.querySelectorAll('.code-line');
      const startLineEl = allLines[bracketHighlight.line] as HTMLElement;
      const endLineEl = allLines[bracketHighlight.matchLine] as HTMLElement;
      if (!startLineEl || !endLineEl) return;

      const codeSpan = startLineEl.querySelector('span[style*="flex: 1"]') || startLineEl.lastElementChild;
      if (!codeSpan) return;

      const codeSpanRect = codeSpan.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const charWidth = codeSpanRect.width / (codeSpan.textContent?.length || 1);

      const startLeft = codeSpanRect.left - containerRect.left + bracketHighlight.col * charWidth;
      const endLeft = codeSpanRect.left - containerRect.left + bracketHighlight.matchCol * charWidth;
      const lineTop = startLineEl.getBoundingClientRect().top - containerRect.top;
      const lineBottom = endLineEl.getBoundingClientRect().bottom - containerRect.top;

      const bracketW = charWidth + 2;
      const bracketH = startLineEl.getBoundingClientRect().height;

      const positions = [
        { left: startLeft, top: lineTop, w: bracketW, h: bracketH },
        { left: endLeft, top: lineBottom - bracketH, w: bracketW, h: bracketH }
      ];

      positions.forEach((pos) => {
        const overlay = document.createElement('div');
        overlay.className = 'bracket-overlay';
        overlay.style.cssText = `
          position: absolute;
          left: ${pos.left}px;
          top: ${pos.top}px;
          width: ${pos.w}px;
          height: ${pos.h}px;
          background: rgba(38, 79, 120, 0.6);
          border-radius: 2px;
          pointer-events: none;
          z-index: 10;
        `;
        container.appendChild(overlay);
      });

      const lineLeft = Math.min(startLeft, endLeft) + bracketW / 2 - 1;
      const lineOverlay = document.createElement('div');
      lineOverlay.className = 'bracket-line-overlay';
      lineOverlay.style.cssText = `
        position: absolute;
        left: ${lineLeft}px;
        top: ${lineTop + bracketH}px;
        width: 2px;
        height: ${Math.max(0, lineBottom - lineTop - bracketH * 2)}px;
        border-left: 2px dashed rgba(38, 79, 120, 0.6);
        pointer-events: none;
        z-index: 10;
      `;
      container.appendChild(lineOverlay);
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [bracketHighlight]);

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
                onDoubleClick={handleCodeDoubleClick}
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
