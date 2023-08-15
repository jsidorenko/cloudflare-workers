/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

import { error, json } from 'itty-router';
import apiRouter from './router';

export default {
	fetch: (request, ...args) =>
		apiRouter
			.handle(request, ...args)
			.then(json) // send as JSON
			.catch(error), // catch errors
};
