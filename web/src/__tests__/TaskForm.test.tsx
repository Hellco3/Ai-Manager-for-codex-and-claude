import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import React from 'react';
import TaskForm from '../components/task/TaskForm';
import { t } from '../i18n';

describe('TaskForm', () => {
  it('renders correctly in Chinese', () => {
    render(
      <BrowserRouter>
        <TaskForm onSubmit={() => {}} isSubmitting={false} />
      </BrowserRouter>,
    );
    expect(screen.getByText(t.form.execute)).toBeInTheDocument();
    expect(screen.getByText(t.form.auto)).toBeInTheDocument();
    expect(screen.getByText(t.form.semiAuto)).toBeInTheDocument();
  });

  it('disables submit when empty', () => {
    render(
      <BrowserRouter>
        <TaskForm onSubmit={() => {}} isSubmitting={false} />
      </BrowserRouter>,
    );
    const btn = screen.getByText(t.form.execute);
    expect(btn).toBeDisabled();
  });

  it('shows submitting state', () => {
    render(
      <BrowserRouter>
        <TaskForm onSubmit={() => {}} isSubmitting={true} />
      </BrowserRouter>,
    );
    expect(screen.getByText(t.form.decomposing)).toBeInTheDocument();
  });
});
