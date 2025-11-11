# Contributing to CTO

Thank you for your interest in contributing to CTO! This document provides guidelines and instructions for contributing.

## Development Setup

### Prerequisites

- Node.js 20+
- pnpm 8+
- Docker and Docker Compose (optional, for containerized development)

### Local Development

1. **Fork and clone the repository**

```bash
git clone https://github.com/your-username/cto.git
cd cto
```

2. **Install dependencies**

```bash
pnpm install
```

3. **Set up environment variables**

```bash
# Copy example files
cp .env.example .env
cp api/.env.example api/.env

# Edit .env files with your credentials
# - Supabase: Create a free project at https://supabase.com
# - OpenAI: Get API key at https://platform.openai.com/api-keys
```

4. **Run in development mode**

```bash
pnpm -w dev
# API runs on http://localhost:8080
# Web runs on http://localhost:5173
```

## Project Structure

```
cto/
├── api/              # Express.js backend
│   ├── src/         # Source code
│   ├── test/        # API tests
│   └── docs/        # API documentation
├── web/             # React frontend
│   ├── src/         # Source code
│   └── test/        # Component tests
├── supabase/        # Database schema and migrations
└── resources/       # LLM prompts and templates
```

## Making Changes

### Code Style

- **TypeScript**: Strict mode enabled
- **Formatting**: Use the project's existing conventions
- **Linting**: Run `pnpm -w lint` before committing

### Testing

```bash
# Run all tests
pnpm -w test

# Run specific workspace tests
pnpm --filter api test
pnpm --filter web test

# Watch mode
pnpm --filter api test -- --watch
```

### Commit Messages

Use clear, descriptive commit messages:

```
feat: add resume export to PDF
fix: resolve knowledge base source deletion
docs: update deployment guide
refactor: simplify job card component
test: add tests for preference predictor
```

### Pull Request Process

1. **Create a feature branch**

```bash
git checkout -b feature/your-feature-name
```

2. **Make your changes**
   - Write tests for new features
   - Update documentation as needed
   - Ensure all tests pass

3. **Push and create PR**

```bash
git push origin feature/your-feature-name
```

4. **PR Guidelines**
   - Describe what your changes do
   - Reference any related issues
   - Include screenshots for UI changes
   - Ensure CI passes

## Development Guidelines

### API Development

- Place new endpoints in `api/src/routes/`
- Add LLM prompts to `api/resources/llm_prompts/`
- Update API docs in `api/docs/API.md`
- Write integration tests for new endpoints

### Frontend Development

- Use TypeScript for all new components
- Follow existing component patterns
- Keep components focused and reusable
- Use Tailwind CSS for styling
- Update types in `web/src/types.ts`

### Database Changes

- Add new migrations to `supabase/migrations/`
- Use descriptive migration file names
- Test migrations on a clean database
- Document schema changes

## Common Tasks

### Adding a New API Endpoint

1. Create route handler in `api/src/routes/`
2. Add type definitions in `api/src/types.ts`
3. Update API client in `web/src/api/client.ts`
4. Add frontend types in `web/src/types.ts`
5. Write tests in `api/test/`

### Adding a New Feature

1. Design the data model
2. Add database migration if needed
3. Implement API endpoints
4. Create frontend components
5. Add tests
6. Update documentation

### Debugging

```bash
# API logs
pnpm --filter api dev
# Check terminal output for errors

# Frontend
# Open browser console (F12)
# Network tab for API calls
# Console tab for errors
```

## Questions?

- **Documentation**: Check the [API docs](api/docs/API.md) and [examples](api/docs/EXAMPLES.md)
- **Issues**: Search existing issues or create a new one
- **Discussions**: Use GitHub Discussions for questions

## Code of Conduct

- Be respectful and inclusive
- Provide constructive feedback
- Focus on what is best for the community
- Show empathy towards other contributors

## License

By contributing, you agree that your contributions will be licensed under the same license as the project.
