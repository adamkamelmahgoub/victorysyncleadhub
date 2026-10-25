import {test} from 'node:test';
import assert from 'node:assert/strict';
import {allowedMcpRedirect} from '../lib/mcp-auth.js';
import {authorizeFormCsp} from '../lib/mcp-oauth.js';

test('MCP OAuth allows exact Claude and ChatGPT callback formats',()=>{
  assert.equal(allowedMcpRedirect('https://claude.ai/api/mcp/auth_callback'),true);
  assert.equal(allowedMcpRedirect('https://chatgpt.com/connector_platform_oauth_redirect'),true);
  assert.equal(allowedMcpRedirect('https://chatgpt.com/connector/oauth/callback_abc123'),true);
  for(const value of ['https://chatgpt.com.evil.example/connector/oauth/callback_abc123',
    'https://chatgpt.com/connector/oauth/abc/def','http://chatgpt.com/connector/oauth/callback_abc123',
    'https://chatgpt.com/connector/oauth/callback_abc123?redirect=https://evil.example'])
    assert.equal(allowedMcpRedirect(value),false);
});

test('authorization form can return to every allowed OAuth provider',()=>{
  const formAction=authorizeFormCsp.split(';').find(part=>part.trim().startsWith('form-action'))||'';
  for(const callback of ['https://claude.ai/api/mcp/auth_callback','https://claude.com/api/mcp/auth_callback',
    'https://chatgpt.com/connector_platform_oauth_redirect']){
    assert.equal(allowedMcpRedirect(callback),true);
    assert.ok(formAction.includes(new URL(callback).origin),`${callback} is blocked by form-action`);
  }
});
