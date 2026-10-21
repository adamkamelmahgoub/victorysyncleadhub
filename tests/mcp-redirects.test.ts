import {test} from 'node:test';
import assert from 'node:assert/strict';
import {allowedMcpRedirect} from '../lib/mcp-auth.js';

test('MCP OAuth allows exact Claude and ChatGPT callback formats',()=>{
  assert.equal(allowedMcpRedirect('https://claude.ai/api/mcp/auth_callback'),true);
  assert.equal(allowedMcpRedirect('https://chatgpt.com/connector_platform_oauth_redirect'),true);
  assert.equal(allowedMcpRedirect('https://chatgpt.com/connector/oauth/callback_abc123'),true);
  for(const value of ['https://chatgpt.com.evil.example/connector/oauth/callback_abc123',
    'https://chatgpt.com/connector/oauth/abc/def','http://chatgpt.com/connector/oauth/callback_abc123',
    'https://chatgpt.com/connector/oauth/callback_abc123?redirect=https://evil.example'])
    assert.equal(allowedMcpRedirect(value),false);
});
