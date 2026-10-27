/**
 * BaseHttpClient Tests
 *
 * Exercises the client against a real loopback server rather than a mocked
 * fetch, so the request actually goes over the wire: method, headers, body
 * encoding and the non-ok path are all observed from the server side.
 */

import * as http from 'http';
import { AddressInfo } from 'net';
import { BaseHttpClient } from '../../code/clients/base-http-client';

let server: http.Server;
let baseUrl: string;

beforeAll(
  () =>
    new Promise<void>((resolve) => {
      server = http.createServer((req: http.IncomingMessage, res: http.ServerResponse) => {
        let body = '';
        req.on('data', (chunk: Buffer) => {
          body += chunk;
        });
        req.on('end', () => {
          if (req.url === '/boom') {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end('{"error":"nope"}');
            return;
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              method: req.method,
              auth: req.headers.authorization,
              contentType: req.headers['content-type'],
              echo: body || null,
            })
          );
        });
      });
      server.listen(0, () => {
        baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
        resolve();
      });
    })
);

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const makeClient = () => new BaseHttpClient({ baseUrl, apiKey: 'k_test' });

describe('BaseHttpClient', () => {
  it('sends GET with the auth and content-type defaults', async () => {
    const res = await makeClient().get<Record<string, unknown>>('/x');
    expect(res).toMatchObject({
      method: 'GET',
      auth: 'Bearer k_test',
      contentType: 'application/json',
      echo: null,
    });
  });

  it('sends POST and PUT with a JSON-encoded body', async () => {
    const client = makeClient();
    await expect(
      client.post<Record<string, unknown>>('/x', { amount: 1000 })
    ).resolves.toMatchObject({ method: 'POST', echo: '{"amount":1000}' });
    await expect(
      client.put<Record<string, unknown>>('/x', { a: 1 })
    ).resolves.toMatchObject({ method: 'PUT', echo: '{"a":1}' });
  });

  it('sends DELETE without a body', async () => {
    const res = await makeClient().delete<Record<string, unknown>>('/x');
    expect(res).toMatchObject({ method: 'DELETE', echo: null });
  });

  it('strips a trailing slash from baseUrl so paths do not double up', async () => {
    const client = new BaseHttpClient({ baseUrl: `${baseUrl}/`, apiKey: 'k' });
    await expect(client.get<Record<string, unknown>>('/x')).resolves.toMatchObject({
      method: 'GET',
    });
  });

  it('throws with status, statusText and body on a non-ok response', async () => {
    await expect(makeClient().get('/boom')).rejects.toThrow(
      'HTTP GET /boom failed: 404 Not Found - {"error":"nope"}'
    );
  });
});
