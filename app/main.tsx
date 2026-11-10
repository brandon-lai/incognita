import { createRoot } from 'react-dom/client';
import { App } from './App';
import { stage } from './engine/stage';
import { gl3 } from './globe/Scene';
import { overlay } from './globe/overlay';
import './styles.css';

// A handle for the end-to-end checks and for poking at the stage from the console.
(globalThis as unknown as { __terra: unknown }).__terra = { stage, gl3, overlay };

createRoot(document.getElementById('root')!).render(<App />);
