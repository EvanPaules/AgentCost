# Contributing to AgentCost

Thanks for your interest in contributing! Here's how to get started.

## Getting Started

1. Fork the repo and clone it locally
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run tests:
   ```bash
   npm test
   ```
4. Build:
   ```bash
   npm run build
   ```

## Making Changes

1. Create a branch from `main`:
   ```bash
   git checkout -b my-feature
   ```
2. Make your changes
3. Add tests for new functionality
4. Make sure all tests pass: `npm test`
5. Commit with a clear message

## What We're Looking For

- **New model pricing**  - if a provider updates prices or a new model drops, PRs welcome
- **New provider support**  - add detection for more API hosts in the proxy
- **Cost optimization insights**  - ideas for helping users understand where to save money
- **Bug fixes**  - if something's wrong, please open an issue or fix it
- **Documentation**  - improvements to README, examples, or inline docs

## Pull Requests

- Keep PRs focused  - one feature or fix per PR
- Include tests for new functionality
- Update the README if you're adding user-facing features
- Make sure `npm test` passes before submitting

## Reporting Issues

Open an issue on GitHub with:
- What you expected to happen
- What actually happened
- Steps to reproduce
- Node.js version and OS

## Code Style

- TypeScript strict mode
- No external runtime dependencies
- Keep it simple  - this is a lightweight library

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
