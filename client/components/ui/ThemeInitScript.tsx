/**
 * components/ui/ThemeInitScript.tsx — Applique le thème AVANT React
 * 
 * Ce script inline s'exécute synchronement dans le <head>,
 * AVANT que React ne se monte. Ça évite :
 *   1. Le flash de thème incorrect (dark → light)
 *   2. L'erreur "Node.removeChild" de mismatch d'hydratation
 */

export function ThemeInitScript() {
  // Ce script est rendu côté serveur et exécuté avant React
  const script = `
    (function() {
      try {
        var theme = localStorage.getItem('theme') || 'dark';
        document.documentElement.className = theme;
      } catch(e) {
        document.documentElement.className = 'dark';
      }
    })();
  `;

  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
