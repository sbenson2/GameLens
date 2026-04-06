Publish the gamecodex server package to npm.

Steps:
1. Verify npm auth: `npm whoami`
2. If not logged in, tell the user to run `! npm login` in the prompt
3. Build and test: `cd "/Users/s/Documents/Personal/Game Dev/Projects/GameCodex" && npm run build && npm test`
4. Publish: `cd "/Users/s/Documents/Personal/Game Dev/Projects/GameCodex/packages/server" && npm publish --access public`
5. Verify: `npm view gamecodex version` (should match packages/server/package.json)

To bump version before publishing:
```
cd "/Users/s/Documents/Personal/Game Dev/Projects/GameCodex/packages/server" && npm version patch --no-git-tag-version
```

Token is stored in ~/.npmrc. 2FA is disabled on the account and package. Publishing should work directly without browser auth.
