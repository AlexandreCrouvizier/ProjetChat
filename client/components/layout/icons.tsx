/** components/layout/icons.tsx — Icônes de la disposition (traits, couleur du texte) */
const base = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };

export const IconBack = () => <svg {...base}><path d="M15 18l-6-6 6-6" /></svg>;
export const IconMenu = () => <svg {...base}><path d="M3 6h18M3 12h18M3 18h18" /></svg>;
export const IconUsers = () => <svg {...base}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
export const IconPanelLeft = () => <svg {...base}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /></svg>;
export const IconPanelRight = () => <svg {...base}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M15 4v16" /></svg>;
export const IconClose = () => <svg {...base}><path d="M18 6L6 18M6 6l12 12" /></svg>;
export const IconHash = () => <svg {...base}><path d="M4 9h16M4 15h16M10 3L8 21M16 3l-2 18" /></svg>;
export const IconMessage = () => <svg {...base}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>;
export const IconChat = () => <svg {...base}><path d="M8 10h8M8 14h5" /><path d="M21 12a9 9 0 1 1-4-7.5L21 3v9z" /></svg>;
export const IconUser = () => <svg {...base}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>;
