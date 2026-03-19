/**
 * hooks/useMentions.ts — Autocomplete pour les @mentions
 * 
 * Quand l'utilisateur tape @ dans l'input :
 *   1. Détecte le mot en cours de frappe après le @
 *   2. Recherche les utilisateurs correspondants via l'API
 *   3. Retourne la liste pour le dropdown
 *   4. Insère le pseudo sélectionné dans le texte
 */

'use client';

import { useState, useCallback, useRef } from 'react';
import api from '@/lib/api';

export interface MentionSuggestion {
  id: string;
  username: string;
  avatar_url: string | null;
  tier: string;
}

export function useMentions(groupId: string | null) {
  const [suggestions, setSuggestions] = useState<MentionSuggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');  // Le texte après @
  const [mentionStart, setMentionStart] = useState(-1);  // Position du @ dans le texte
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Appelé à chaque changement de texte dans l'input
   * Détecte si on est en train de taper une @mention
   */
  const handleInputChange = useCallback((text: string, cursorPosition: number) => {
    // Chercher le @ le plus proche avant le curseur
    const textBeforeCursor = text.substring(0, cursorPosition);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');

    if (lastAtIndex === -1) {
      // Pas de @ → fermer le dropdown
      setIsOpen(false);
      setSuggestions([]);
      return;
    }

    // Vérifier que le @ est au début ou après un espace
    const charBefore = lastAtIndex > 0 ? text[lastAtIndex - 1] : ' ';
    if (charBefore !== ' ' && charBefore !== '\n' && lastAtIndex !== 0) {
      setIsOpen(false);
      setSuggestions([]);
      return;
    }

    // Extraire le texte entre @ et le curseur
    const query = text.substring(lastAtIndex + 1, cursorPosition);

    // Vérifier que le query ne contient pas d'espace (sinon ce n'est plus une mention)
    if (query.includes(' ')) {
      setIsOpen(false);
      setSuggestions([]);
      return;
    }

    setMentionStart(lastAtIndex);
    setMentionQuery(query);

    // Rechercher si le query fait au moins 1 caractère
    if (query.length >= 1) {
      // Debounce : attendre 200ms avant de lancer la recherche
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
      searchTimeoutRef.current = setTimeout(async () => {
        try {
          const params = new URLSearchParams({ q: query });
          if (groupId) params.set('group_id', groupId);
          const { data } = await api.get(`/users/search?${params}`);
          setSuggestions(data.users || []);
          setIsOpen(data.users?.length > 0);
        } catch {
          setSuggestions([]);
          setIsOpen(false);
        }
      }, 200);
    } else {
      // Juste @ sans rien après → pas encore de recherche
      setSuggestions([]);
      setIsOpen(false);
    }
  }, [groupId]);

  /**
   * Quand l'utilisateur sélectionne un pseudo dans le dropdown
   * Retourne le nouveau texte avec le pseudo inséré
   */
  const selectMention = useCallback((text: string, username: string): { newText: string; newCursorPos: number } => {
    // Remplacer "@query" par "@username "
    const before = text.substring(0, mentionStart);
    const after = text.substring(mentionStart + 1 + mentionQuery.length);
    const newText = `${before}@${username} ${after}`;
    const newCursorPos = mentionStart + 1 + username.length + 1; // +1 pour l'espace après

    setIsOpen(false);
    setSuggestions([]);

    return { newText, newCursorPos };
  }, [mentionStart, mentionQuery]);

  const closeSuggestions = useCallback(() => {
    setIsOpen(false);
    setSuggestions([]);
  }, []);

  return {
    suggestions,
    isOpen,
    handleInputChange,
    selectMention,
    closeSuggestions,
  };
}
