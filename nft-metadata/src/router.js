import { Router, error } from 'itty-router';
import { CID } from 'multiformats/cid';

const router = Router();

const FAIL_REASONS = {
	TOO_LARGE: 'File size is too large',
	CANT_RESOLVE: 'Unable to resolve hash',
	TIMEOUT: 'Unable to resolve hash in a give time frame',
	WRONG_CONTENT: 'Wrong content',
	INVALID_HASH: 'Invalid hash',
};

const gateways = [
	'https://ipfs.filebase.io/ipfs/',
	'https://gateway.pinata.cloud/ipfs/',
	'https://nftstorage.link/ipfs/',
	'https://ipfs.io/ipfs/',
];

const storedFileMetadata = { httpMetadata: { cacheControl: 'public, max-age=29030400, immutable' } };

async function fetchIpfsData(url) {
	const res = await fetch(url);
	if (!res.ok) {
		throw new Error(`HTTP error! status: ${res.status}`);
	}
	return await res.json();
}

function requestTimeout(timeout) {
	return new Promise((resolve, reject) => {
		setTimeout(() => reject(new Error('TIMEOUT')), timeout);
	});
}

router.get('/ipfs/:hash', async (req, { MAX_FILE_SIZE, FETCH_TIMEOUT, METADATA_BUCKET, METADATA_DB, REUPLOAD_AFTER }, context) => {
	const { params, headers } = req;

	let hash;
	try {
		hash = CID.parse(params.hash);
	} catch (e) {
		return error(400, FAIL_REASONS.INVALID_HASH);
	}

	// normalize hash
	hash = hash.toV1().toString();

	if (headers.get('if-none-match') === `"${hash}"`) {
		return new Response(null, { status: 304 });
	}

	// check if already cached
	const object = await METADATA_BUCKET.get(hash);
	if (object) {
		const data = await object.text();
		const uploaded = +new Date(object.uploaded);
		const now = +new Date();
		const diff = (now - uploaded) / 1000;

		// re-upload the file to reset the creation date
		if (diff > REUPLOAD_AFTER) {
			context.waitUntil(METADATA_BUCKET.put(hash, data, storedFileMetadata));
		}

		const headers = new Headers();
		object.writeHttpMetadata(headers);
		// headers.set('etag', object.httpEtag);
		headers.set('etag', `"${hash}"`);

		return new Response(data, {
			headers,
		});
	}

	// validate against DB
	const dbObject = await METADATA_DB.get(hash, { type: 'json' });
	if (dbObject) {
		return error(400, FAIL_REASONS[dbObject.reason] || FAIL_REASONS.CANT_RESOLVE);
	}

	// fetch from various gateways
	let data;
	try {
		const requests = Promise.any(gateways.map((gateway) => fetchIpfsData(`${gateway}${hash}`)));
		data = await Promise.race([requests, requestTimeout(FETCH_TIMEOUT)]);
	} catch (e) {
		const reason = e.message === 'TIMEOUT' ? 'TIMEOUT' : 'CANT_RESOLVE';
		await METADATA_DB.put(hash, JSON.stringify({ reason }), { expirationTtl: 60 * 60 * 24 * 7 });
		return error(400, FAIL_REASONS[reason]);
	}

	if (!data) {
		return error(400, FAIL_REASONS.WRONG_CONTENT);
	}

	// validate data length
	const dataAsString = JSON.stringify(data);
	const length = dataAsString.length;
	if (length > MAX_FILE_SIZE) {
		const reason = 'TOO_LARGE';
		await METADATA_DB.put(hash, JSON.stringify({ reason }));
		return error(400, FAIL_REASONS[reason]);
	}

	// store in storage
	context.waitUntil(METADATA_BUCKET.put(hash, dataAsString, storedFileMetadata));

	return new Response(data);
});

// 404 for everything else
router.all('*', () => error(404));

export default router;
