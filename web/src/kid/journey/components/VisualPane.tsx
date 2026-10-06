// spec.md > Visual Pane: AI-written HTML runs in a sandboxed frame (scripts and forms
// allowed, no same-origin), so it can't reach the wrapper. With onAppError, a tiny
// reporter is injected so JavaScript errors inside the app reach the Build screen.
// Small pictures (fit) are centered to fill the pane; a placeholder covers the frame
// until each new version has loaded.
import { useEffect, useMemo, useRef, useState } from 'react';

const REPORTER = `<script>(function(){function send(m){try{parent.postMessage({type:'ppg-app-error',message:String(m).slice(0,500)},'*')}catch(e){}}
window.addEventListener('error',function(e){send(e.message||'Script error')});
window.addEventListener('unhandledrejection',function(e){send(e.reason&&e.reason.message||e.reason||'Unhandled promise rejection')});})();</script>`;

// Apps can't use browser storage inside the sandbox (no same-origin), and reading it throws.
// An in-memory stand-in keeps them working for the visit; data resets on reload, which the
// guide tells people up front.
const MEMORY_STORAGE = `<script>(function(){function m(){var d={};return{getItem:function(k){return Object.prototype.hasOwnProperty.call(d,k)?d[k]:null},setItem:function(k,v){d[k]=String(v)},removeItem:function(k){delete d[k]},clear:function(){d={}},key:function(i){return Object.keys(d)[i]||null},get length(){return Object.keys(d).length}}}['localStorage','sessionStorage'].forEach(function(n){try{window[n].getItem('x')}catch(e){try{Object.defineProperty(window,n,{value:m(),configurable:true})}catch(e2){}}})})();</script>`;

const FIT_STYLE = '<style>html,body{margin:0;height:100%}body{display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;font-family:system-ui,sans-serif}body>*{max-width:100%;max-height:100%}</style>';

// Security review: the same strict policy as a shared link (no outside images, requests,
// or navigation away).
const POLICY = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'">`;

// Security review round 2 (M1): right after the doctype, never after a "<head" match, which
// also matched "<header>" (even inside a comment) and could leave the policy without effect.
function inject(html: string, scripts: string): string {
  const doctype = html.match(/^\s*<!doctype[^>]*>/i);
  if (doctype) return doctype[0] + scripts + html.slice(doctype[0].length);
  return scripts + html;
}

function fitted(html: string): string {
  if (/<html[\s>]/i.test(html)) return html;
  return `<!doctype html><html><head><meta charset="utf-8">${FIT_STYLE}</head><body>${html}</body></html>`;
}

interface Props {
  html: string;
  title: string;
  className?: string;
  fit?: boolean;
  onAppError?: (message: string) => void;
}

export default function VisualPane({ html, title, className = '', fit = false, onAppError }: Props) {
  const frame = useRef<HTMLIFrameElement>(null);
  const srcDoc = useMemo(() => {
    const doc = fit ? fitted(html) : html;
    return inject(doc, POLICY + (onAppError ? MEMORY_STORAGE + REPORTER : MEMORY_STORAGE));
  }, [html, fit, onAppError]);
  const [loadedDoc, setLoadedDoc] = useState<string | null>(null);

  useEffect(() => {
    if (!onAppError) return;
    const listener = (event: MessageEvent) => {
      if (event.source === frame.current?.contentWindow && event.data?.type === 'ppg-app-error') onAppError(event.data.message);
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, [onAppError]);

  return (
    <div className={`relative overflow-hidden rounded-3xl border-2 border-line bg-white ${className}`}>
      <iframe ref={frame} title={title} sandbox="allow-scripts allow-forms" srcDoc={srcDoc}
        onLoad={() => setLoadedDoc(srcDoc)} className="h-full w-full" />
      {loadedDoc !== srcDoc && (
        <div className="absolute inset-0 flex items-center justify-center bg-surface-2" aria-hidden>
          <span className="h-3 w-3 animate-ping rounded-full bg-accent" />
        </div>
      )}
    </div>
  );
}
