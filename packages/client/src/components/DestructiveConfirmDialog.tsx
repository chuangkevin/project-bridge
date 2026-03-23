import React, { useState, useEffect, useCallback } from 'react';

interface Props {
  open: boolean;
  title: string;
  message: string;
  confirmText: string;
  confirmLabel?: string;
  buttonText?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

const DestructiveConfirmDialog: React.FC<Props> = ({
  open,
  title,
  message,
  confirmText,
  confirmLabel = '請輸入以下文字以確認',
  buttonText = '確認刪除',
  onConfirm,
  onCancel,
}) => {
  const [inputValue, setInputValue] = useState('');
  const isMatch = inputValue === confirmText;

  useEffect(() => {
    if (!open) {
      setInputValue('');
    }
  }, [open]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    },
    [onCancel],
  );

  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [open, handleKeyDown]);

  if (!open) return null;

  const overlayStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    fontFamily,
  };

  const cardStyle: React.CSSProperties = {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    border: '1px solid #e2e8f0',
    maxWidth: 440,
    width: '100%',
    margin: '0 16px',
    boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)',
    overflow: 'hidden',
  };

  const headerStyle: React.CSSProperties = {
    borderTop: '4px solid #dc2626',
    padding: '24px 24px 0 24px',
  };

  const titleRowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  };

  const iconStyle: React.CSSProperties = {
    width: 24,
    height: 24,
    flexShrink: 0,
  };

  const titleStyle: React.CSSProperties = {
    fontSize: 18,
    fontWeight: 700,
    color: '#111827',
    margin: 0,
    fontFamily,
  };

  const messageStyle: React.CSSProperties = {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 1.6,
    margin: '0 0 20px 0',
    fontFamily,
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 13,
    fontWeight: 600,
    color: '#374151',
    marginBottom: 6,
    fontFamily,
  };

  const confirmTextHighlightStyle: React.CSSProperties = {
    fontWeight: 700,
    color: '#111827',
    userSelect: 'all',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    fontSize: 14,
    fontFamily,
    border: '1px solid #d1d5db',
    borderRadius: 6,
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.15s',
  };

  const bodyStyle: React.CSSProperties = {
    padding: '16px 24px 24px 24px',
  };

  const buttonRowStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 20,
  };

  const cancelButtonStyle: React.CSSProperties = {
    padding: '8px 16px',
    fontSize: 14,
    fontWeight: 500,
    fontFamily,
    borderRadius: 6,
    border: '1px solid #d1d5db',
    backgroundColor: '#ffffff',
    color: '#374151',
    cursor: 'pointer',
    transition: 'background-color 0.15s',
  };

  const confirmButtonStyle: React.CSSProperties = {
    padding: '8px 16px',
    fontSize: 14,
    fontWeight: 600,
    fontFamily,
    borderRadius: 6,
    border: 'none',
    backgroundColor: isMatch ? '#dc2626' : '#fca5a5',
    color: '#ffffff',
    cursor: isMatch ? 'pointer' : 'not-allowed',
    opacity: isMatch ? 1 : 0.6,
    transition: 'background-color 0.15s, opacity 0.15s',
  };

  const warningIcon = (
    <svg
      style={iconStyle}
      viewBox="0 0 24 24"
      fill="none"
      stroke="#dc2626"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );

  return (
    <div style={overlayStyle} data-testid="destructive-dialog" onClick={onCancel}>
      <div style={cardStyle} onClick={(e) => e.stopPropagation()}>
        <div style={headerStyle}>
          <div style={titleRowStyle}>
            {warningIcon}
            <h2 style={titleStyle}>{title}</h2>
          </div>
          <p style={messageStyle}>{message}</p>
        </div>
        <div style={bodyStyle}>
          <label style={labelStyle}>
            {confirmLabel}：<span style={confirmTextHighlightStyle}>{confirmText}</span>
          </label>
          <input
            data-testid="destructive-input"
            type="text"
            style={inputStyle}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={confirmText}
            autoFocus
          />
          <div style={buttonRowStyle}>
            <button
              data-testid="destructive-cancel"
              type="button"
              style={cancelButtonStyle}
              onClick={onCancel}
            >
              取消
            </button>
            <button
              data-testid="destructive-confirm"
              type="button"
              style={confirmButtonStyle}
              disabled={!isMatch}
              onClick={() => {
                if (isMatch) onConfirm();
              }}
            >
              {buttonText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DestructiveConfirmDialog;
