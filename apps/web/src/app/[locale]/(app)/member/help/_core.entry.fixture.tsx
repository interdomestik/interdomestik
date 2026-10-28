import React from 'react';

export const buttonMock = {
  Button: ({
    asChild,
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    asChild?: boolean;
  }) => (asChild ? <>{children}</> : <button {...props}>{children}</button>),
};

export const cardMock = {
  Card: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <section {...props}>{children}</section>
  ),
  CardContent: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <div {...props}>{children}</div>
  ),
  CardDescription: ({ children, ...props }: React.HTMLAttributes<HTMLParagraphElement>) => (
    <p {...props}>{children}</p>
  ),
  CardHeader: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <header {...props}>{children}</header>
  ),
  CardTitle: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h2 {...props}>{children}</h2>
  ),
};

export const iconMock = {
  Mail: () => <span aria-hidden="true" />,
  MessageSquare: () => <span aria-hidden="true" />,
  Phone: () => <span aria-hidden="true" />,
};

export const routingMock = {
  Link: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href?.toString()} {...props}>
      {children}
    </a>
  ),
};
