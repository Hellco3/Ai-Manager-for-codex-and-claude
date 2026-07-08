import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import React from 'react';
import TaskForm from '../components/task/TaskForm';

describe('TaskForm', () => {
  it('renders correctly', () => {
    render(
      <BrowserRouter>
        <TaskForm onSubmit={() => {}} isSubmitting={false} />
      </BrowserRouter>,
    );
    expect(screen.getByPlaceholderText(/Describe your task/)).toBeInTheDocument();
    expect(screen.getByText('Execute Task')).toBeInTheDocument();
    expect(screen.getByText('Auto')).toBeInTheDocument();
    expect(screen.getByText('Semi-Auto')).toBeInTheDocument();
  });

  it('disables submit when empty', () => {
    render(
      <BrowserRouter>
        <TaskForm onSubmit={() => {}} isSubmitting={false} />
      </BrowserRouter>,
    );
    const btn = screen.getByText('Execute Task');
    expect(btn).toBeDisabled();
  });

  it('shows submitting state', () => {
    render(
      <BrowserRouter>
        <TaskForm onSubmit={() => {}} isSubmitting={true} />
      </BrowserRouter>,
    );
    expect(screen.getByText('Decomposing...')).toBeInTheDocument();
  });
});
