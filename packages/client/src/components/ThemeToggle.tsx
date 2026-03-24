import { useState, useEffect } from 'react';

function getTheme(): 'light' | 'dark' {
  const stored = localStorage.getItem('pb-theme');
  if (stored === 'dark') return 'dark';
  if (stored === 'light') return 'light';
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark'>(getTheme);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
    localStorage.setItem('pb-theme', theme);
  }, [theme]);

  const toggle = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  return (
    <button
      type="button"
      onClick={toggle}
      title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      data-testid="theme-toggle"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '36px',
        height: '36px',
        border: '1px solid var(--border-primary)',
        borderRadius: '8px',
        backgroundColor: 'var(--bg-secondary)',
        color: 'var(--text-secondary)',
        cursor: 'pointer',
        fontSize: '18px',
        lineHeight: 1,
      }}
    >
      {theme === 'dark' ? '\u2600' : '\uD83C\uDF19'}
    </button>
  );
}
