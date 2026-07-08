import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import React from 'react';
import TaskForm from '../components/task/TaskForm';

describe('TaskForm', () => {
  it('renders correctly in Chinese', () => {
    render(
      <BrowserRouter>
        <TaskForm onSubmit={() => {}} isSubmitting={false} />
      </BrowserRouter>,
    );
    expect(screen.getByText('执行任务')).toBeInTheDocument();
    expect(screen.getByText('自动')).toBeInTheDocument();
    expect(screen.getByText('半自动')).toBeInTheDocument();
  });

  it('disables submit when empty', () => {
    render(
      <BrowserRouter>
        <TaskForm onSubmit={() => {}} isSubmitting={false} />
      </BrowserRouter>,
    );
    const btn = screen.getByText('执行任务');
    expect(btn).toBeDisabled();
  });

  it('shows submitting state', () => {
    render(
      <BrowserRouter>
        <TaskForm onSubmit={() => {}} isSubmitting={true} />
      </BrowserRouter>,
    );
    expect(screen.getByText('拆解中...')).toBeInTheDocument();
  });
});
