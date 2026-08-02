import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { db } from './db/db';
import { bootstrap } from './db/seed';
import './styles/base.css';

const root = createRoot(document.getElementById('root')!);

function fatal(message: string) {
  root.render(
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        padding: 32,
        textAlign: 'center',
        fontFamily: 'Pretendard, system-ui, sans-serif',
      }}
    >
      <div style={{ fontSize: 17, fontWeight: 800 }}>앱을 열지 못했어</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#8B9199', lineHeight: 1.6 }}>
        {message}
      </div>
      <button
        type="button"
        onClick={() => location.reload()}
        style={{
          marginTop: 8,
          border: 0,
          borderRadius: 14,
          padding: '12px 22px',
          background: '#7B87F5',
          color: '#fff',
          fontSize: 14,
          fontWeight: 800,
          fontFamily: 'inherit',
        }}
      >
        새로고침
      </button>
    </div>,
  );
}

// The service worker updates itself, so an old tab can still hold the database
// open when a new one tries to upgrade it. Both directions need handling, or
// the app silently dies on a white screen.
db.on('versionchange', () => {
  db.close();
  fatal('앱이 업데이트됐어. 새로고침하면 이어서 쓸 수 있어.');
});

db.on('blocked', () => {
  fatal('다른 탭에서 앱이 열려 있어. 모두 닫고 새로고침해줘.');
});

bootstrap()
  .then(() => {
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  })
  .catch((err: unknown) => {
    const name = err instanceof Error ? err.name : '';
    if (name === 'VersionError') {
      fatal('앱 버전이 맞지 않아. 새로고침해줘.');
    } else {
      console.error('bootstrap failed', err);
      fatal('저장소를 여는 데 실패했어. 브라우저의 시크릿 모드이거나 저장 공간이 부족할 수 있어.');
    }
  });
