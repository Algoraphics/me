import React from 'react';
import { createRoot } from 'react-dom/client';
import { Website } from "./Website";

document.body.style.margin = '0 0 0 0';

const container = document.getElementById('root');
if (container) {
    const root = createRoot(container);
    root.render(<Website />);
}