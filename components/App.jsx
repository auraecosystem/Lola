import React from 'react';
import Chat from './Chat';
import MoodTracker from './MoodTracker';

export default function App() {
  return (
    <div className="app-container">
      <h1>Lola</h1>
      <Chat />
      <MoodTracker />
    </div>
  );
}
