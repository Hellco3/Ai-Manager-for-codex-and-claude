import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import App from '../App';

describe('App', () => {
  it('renders without crashing', () => {
    render(
      <BrowserRouter>
        <App />
      </BrowserRouter>,
    );
    expect(screen.getByText('AI')).toBeInTheDocument();
    expect(screen.getByText('Orchestrator')).toBeInTheDocument();
  });

  it('renders the header', () => {
    render(
      <BrowserRouter>
        <App />
      </BrowserRouter>,
    );
    expect(screen.getByText('Task Orchestration Platform')).toBeInTheDocument();
  });
});
