// Local proof only: fail fast before any Node socket/HTTP/fetch operation.
import net from 'node:net';
import tls from 'node:tls';
import http from 'node:http';
import https from 'node:https';
import dgram from 'node:dgram';
import dns from 'node:dns';
import { syncBuiltinESMExports } from 'node:module';
const denied = () => { throw new Error('PULSE_FIXTURE_NETWORK_DISABLED'); };
net.connect = denied; net.createConnection = denied; net.Socket.prototype.connect = denied;
net.Server.prototype.listen = denied; tls.connect = denied;
http.request = denied; http.get = denied; https.request = denied; https.get = denied;
dgram.createSocket = denied; dns.lookup = denied; dns.resolve = denied;
globalThis.fetch = denied;
syncBuiltinESMExports();
