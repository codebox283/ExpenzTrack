import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import Modal from 'react-modal'; // Import Modal

// Initialize Modal
Modal.setAppElement('#root');


const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
    <App />
);