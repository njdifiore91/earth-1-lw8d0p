# Matter Platform Web Frontend

Enterprise-grade React application for the Matter satellite data product matching platform.

## System Requirements

- Node.js >= 18.0.0
- npm >= 8.0.0

### Supported Browsers
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## Getting Started

### Installation

```bash
npm install
```

### Environment Setup

Create the following environment files with appropriate values:

- `.env.development` - Development environment variables
- `.env.production` - Production environment variables  
- `.env.test` - Test environment variables

Required environment variables:
```
VITE_API_URL=<api_endpoint>
VITE_MAPBOX_TOKEN=<mapbox_access_token>
VITE_AUTH0_DOMAIN=<auth0_domain>
VITE_AUTH0_CLIENT_ID=<auth0_client_id>
VITE_NEW_RELIC_LICENSE_KEY=<new_relic_key>
```

### Development

Start the development server:
```bash
npm run dev
```

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Create production build
- `npm run preview` - Preview production build locally
- `npm run test` - Run test suite
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Generate test coverage report
- `npm run test:ci` - Run tests in CI environment
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Fix ESLint issues
- `npm run format` - Format code with Prettier
- `npm run format:check` - Check code formatting
- `npm run typecheck` - Run TypeScript type checking
- `npm run validate` - Run all validation checks

## Project Structure

```
src/
├── assets/          # Static assets
├── components/      # Reusable React components
├── hooks/           # Custom React hooks
├── pages/          # Route components
├── services/       # API and external service integrations
├── store/          # Redux store configuration
├── types/          # TypeScript type definitions
└── utils/          # Utility functions
```

## Development Guidelines

### Code Style

- Follow TypeScript strict mode guidelines
- Use functional components with hooks
- Implement proper error boundaries
- Follow React performance best practices
- Use proper TypeScript types/interfaces

### Component Development

- Create atomic, reusable components
- Implement proper prop validation
- Use React.memo for performance optimization
- Follow accessibility (WCAG 2.1) guidelines
- Include comprehensive unit tests

### State Management

- Use Redux Toolkit for global state
- Implement proper action creators
- Use proper TypeScript types for state
- Follow Redux best practices
- Implement proper error handling

## Testing Requirements

### Unit Testing

- Jest and React Testing Library
- Minimum 80% code coverage
- Test component rendering
- Test user interactions
- Test error scenarios

### Integration Testing

- Test component integration
- Test Redux store integration
- Test API integration
- Test routing functionality

### E2E Testing

- Test critical user flows
- Test form submissions
- Test error handling
- Test authentication flows

## Security Considerations

### Environment Variables

- Never commit .env files
- Use proper secret management
- Implement proper validation
- Follow security best practices

### Authentication

- Implement Auth0 integration
- Follow OAuth 2.0 best practices
- Implement proper token management
- Handle session timeouts

### API Security

- Implement proper CORS policies
- Use HTTPS for all requests
- Implement rate limiting
- Handle API errors properly

## Building for Production

### Build Process

```bash
npm run build
```

### Build Optimization

- Code splitting implementation
- Tree shaking enabled
- Asset optimization
- Bundle size analysis

### Deployment Checklist

- Environment variables configured
- Build artifacts validated
- Security checks passed
- Performance metrics verified

## Performance Optimization

### Core Web Vitals

- Implement proper lazy loading
- Optimize image loading
- Implement proper caching
- Monitor performance metrics

### Bundle Optimization

- Implement code splitting
- Optimize dependencies
- Implement proper tree shaking
- Monitor bundle size

## Monitoring and Analytics

### Error Tracking

- New Relic integration
- Error boundary implementation
- Error logging strategy
- Error reporting workflow

### Performance Monitoring

- Core Web Vitals tracking
- Custom performance metrics
- User interaction tracking
- Performance optimization workflow

## Browser Compatibility

Ensure proper functionality across supported browsers:

| Browser | Minimum Version | Notes |
|---------|----------------|-------|
| Chrome  | 90+ | Full support |
| Firefox | 88+ | Full support |
| Safari  | 14+ | Limited WebGL optimization |
| Edge    | 90+ | Full support |

## Additional Resources

- [React Documentation](https://react.dev)
- [TypeScript Documentation](https://www.typescriptlang.org)
- [Redux Toolkit Documentation](https://redux-toolkit.js.org)
- [Material UI Documentation](https://mui.com)
- [Mapbox GL JS Documentation](https://docs.mapbox.com/mapbox-gl-js)

## License

Proprietary - All rights reserved

## Support

For technical support, contact the development team at:
- Email: dev-support@matter.com
- Slack: #matter-platform-support