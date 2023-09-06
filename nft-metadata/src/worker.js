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
			.then((response, options) => {
				if (!response.headers) {
					response.headers = new Headers();
				}
				// enable cors
				response.headers.set('Access-Control-Allow-Origin', '*');
				response.headers.set('Access-Control-Allow-Methods', 'GET,HEAD,POST,OPTIONS');
				response.headers.set('Access-Control-Max-Age', '86400');
				// set json type
				response.headers.set('Content-Type', 'application/json');
				return json(response, options);
			}) // send as JSON
			.catch(error), // catch errors
};
