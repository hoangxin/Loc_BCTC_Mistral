'use client';

import { useState } from 'react';

type Status = 'idle' | 'loading' | 'not-found' | 'error';

export default function CustomSourceForm() {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('');

  async function submit() {
    if (!url.trim()) return;
    setStatus('loading');
    setMessage('');
    try {
      const response = await fetch('/api/custom-source', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await response.json();

      if (!response.ok) {
        setMessage(data?.error || 'Có lỗi xảy ra.');
        setStatus('error');
        return;
      }
      if (!data.ok) {
        setMessage(data.message || 'Chưa có');
        setStatus('not-found');
        return;
      }

      window.location.reload();
    } catch {
      setMessage('Không kết nối được tới server.');
      setStatus('error');
    }
  }

  if (!open) {
    return (
      <button className="secondary-button" onClick={() => setOpen(true)}>
        + Thêm nguồn riêng
      </button>
    );
  }

  const busy = status === 'loading';

  return (
    <div className="custom-source-form">
      <input
        type="url"
        className="custom-source-input"
        placeholder="Dán link website công ty..."
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
        }}
        disabled={busy}
      />
      <button className="trigger-button" onClick={submit} disabled={busy}>
        {busy ? 'Đang tìm...' : 'Enter'}
      </button>
      <button className="secondary-button" onClick={() => setOpen(false)} disabled={busy}>
        Đóng
      </button>
      {message && <span className={`trigger-message ${status === 'error' ? 'trigger-message-error' : ''}`}>{message}</span>}
    </div>
  );
}
