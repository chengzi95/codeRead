import React, { useEffect, useRef } from 'react';
import hljs from 'highlight.js';
import 'highlight.js/styles/vs2015.css';

interface CodeHighlightProps {
  code: string;
  language: string;
  searchQuery?: string;
  highlightLine?: number;
  onCodeSelect?: (code: string) => void;
}

const CodeHighlight: React.FC<CodeHighlightProps> = ({ code, language, searchQuery, highlightLine, onCodeSelect }) => {
  const codeRef = useRef<HTMLElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (codeRef.current) {
      const highlighted = hljs.highlight(code, { language });
      codeRef.current.innerHTML = highlighted.value;

      if (searchQuery) {
        const escapedQuery = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(${escapedQuery})`, 'gi');
        
        const walker = document.createTreeWalker(codeRef.current, NodeFilter.SHOW_TEXT);
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
      }
    }
  }, [code, language, searchQuery]);

  useEffect(() => {
    if (highlightLine && containerRef.current) {
      const lineElements = containerRef.current.querySelectorAll('.code-line');
      lineElements.forEach((el, index) => {
        if (index + 1 === highlightLine) {
          (el as HTMLElement).style.background = '#264f78';
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
          (el as HTMLElement).style.background = '';
        }
      });
    }
  }, [highlightLine]);

  const handleSelectionChange = () => {
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
  };

  const lines = code.split('\n');

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
      <div style={{
        padding: '20px 0',
        background: '#2d2d30',
        color: '#858585',
        textAlign: 'right',
        userSelect: 'none',
        minWidth: '50px',
        borderRight: '1px solid #3e3e42'
      }}>
        {lines.map((_, index) => (
          <div key={index} style={{ padding: '0 10px' }}>
            {index + 1}
          </div>
        ))}
      </div>
      <div 
        ref={containerRef}
        onMouseUp={handleSelectionChange}
        style={{
          margin: 0,
          padding: '20px',
          flex: 1,
          whiteSpace: 'pre',
          fontFamily: 'Consolas, Monaco, "Courier New", monospace',
          fontSize: '14px',
          lineHeight: '1.6',
          tabSize: 2,
          textAlign: 'left',
          overflow: 'auto'
        }}
      >
        <code ref={codeRef} style={{ whiteSpace: 'pre', display: 'block', tabSize: 2, textAlign: 'left' }} />
      </div>
    </div>
  );
};

export default CodeHighlight;
