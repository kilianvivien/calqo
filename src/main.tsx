import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import '@/styles/globals.css';
import '@/lib/i18n';
import { patchKonvaTextFont } from '@/editor/canvas/konvaTextFont';
import { App } from '@/app/App';

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root not found');

void patchKonvaTextFont().then(() => {
  createRoot(container).render(
    <StrictMode>
      <Suspense fallback={null}>
        <App />
      </Suspense>
    </StrictMode>,
  );
});
