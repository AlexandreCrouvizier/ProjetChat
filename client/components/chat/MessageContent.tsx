/**
 * components/chat/MessageContent.tsx — Rendu du texte avec @mentions surlignées
 * 
 * Transforme "@Paul" en un span cliquable et coloré.
 * Détecte aussi les URLs et les rend cliquables.
 */

'use client';

const MENTION_REGEX = /@([a-zA-Z0-9_-]{3,30})/g;
const URL_REGEX = /(https?:\/\/[^\s<]+)/g;

interface MessageContentProps {
  content: string;
  currentUsername?: string;  // Pour surligner ses propres mentions différemment
}

export function MessageContent({ content, currentUsername }: MessageContentProps) {
  // Découper le texte en segments : texte normal, @mentions, et URLs
  const parts: Array<{ type: 'text' | 'mention' | 'url'; value: string; isSelf?: boolean }> = [];
  
  let lastIndex = 0;
  // Combiner les deux regex pour trouver tous les tokens
  const combinedRegex = new RegExp(`(${MENTION_REGEX.source})|(${URL_REGEX.source})`, 'g');
  
  let match;
  while ((match = combinedRegex.exec(content)) !== null) {
    // Ajouter le texte avant le match
    if (match.index > lastIndex) {
      parts.push({ type: 'text', value: content.substring(lastIndex, match.index) });
    }

    if (match[1]) {
      // C'est une @mention
      const username = match[2]; // Le groupe capturé dans MENTION_REGEX
      const isSelf = currentUsername ? username.toLowerCase() === currentUsername.toLowerCase() : false;
      parts.push({ type: 'mention', value: username, isSelf });
    } else if (match[3]) {
      // C'est une URL
      parts.push({ type: 'url', value: match[3] });
    }

    lastIndex = match.index + match[0].length;
  }

  // Ajouter le texte restant
  if (lastIndex < content.length) {
    parts.push({ type: 'text', value: content.substring(lastIndex) });
  }

  // Si pas de mentions ni d'URLs, retourner le texte brut
  if (parts.length === 0) {
    return <span>{content}</span>;
  }

  return (
    <span>
      {parts.map((part, i) => {
        if (part.type === 'mention') {
          return (
            <span
              key={i}
              className={`inline-block px-0.5 rounded font-semibold cursor-pointer transition-colors
                ${part.isSelf
                  ? 'bg-[var(--acc)] text-white shadow-[0_0_8px_var(--acc-g)]'
                  : 'bg-[var(--acc-s)] text-[var(--acc)] hover:bg-[rgba(139,92,246,0.2)]'
                }`}
              title={`Voir le profil de ${part.value}`}
            >
              @{part.value}
            </span>
          );
        }
        if (part.type === 'url') {
          return (
            <a
              key={i}
              href={part.value}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--acc)] hover:underline break-all"
            >
              {part.value}
            </a>
          );
        }
        return <span key={i}>{part.value}</span>;
      })}
    </span>
  );
}
