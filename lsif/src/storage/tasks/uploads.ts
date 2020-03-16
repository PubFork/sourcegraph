import * as constants from '../../shared/constants'
import * as fs from 'mz/fs'
import * as path from 'path'
import * as settings from '../settings'
import { createSilentLogger } from '../../shared/logging'
import { TracingContext } from '../../shared/tracing'
import { dbFilename, idFromFilename } from '../../shared/paths'
import { chunk } from 'lodash'
import got from 'got'
import { parseJSON } from '../../shared/encoding/json'

/**
 * Remove upload and temp files that are older than `FAILED_UPLOAD_MAX_AGE`. This assumes
 * that an upload conversion's total duration (from enqueue to completion) is less than this
 * interval during healthy operation.
 *
 * @param ctx The tracing context.
 */
export const cleanFailedUploads = async ({ logger = createSilentLogger() }: TracingContext): Promise<void> => {
    let count = 0
    for await (const filename of candidateFiles()) {
        if (await purgeFile(filename)) {
            count++
        }
    }

    if (count > 0) {
        logger.debug('Removed old files', { count })
    }
}

/** Return an async iterable that yields the path of all files in the temp and uploads dir. */
async function* candidateFiles(): AsyncIterable<string> {
    for (const directory of [constants.TEMP_DIR, constants.UPLOADS_DIR]) {
        for (const basename of await fs.readdir(path.join(settings.STORAGE_ROOT, directory))) {
            yield path.join(settings.STORAGE_ROOT, directory, basename)
        }
    }
}

/**
 * Remove dumps until the space occupied by the dbs directory is below
 * the given limit.
 *
 * @param storageRoot The path where SQLite databases are stored.
 * @param maximumSizeBytes The maximum number of bytes.
 * @param ctx The tracing context.
 */
export async function purgeOldDumps(
    storageRoot: string,
    maximumSizeBytes: number,
    { logger = createSilentLogger() }: TracingContext = {}
): Promise<void> {
    // First, remove all the files in the DB dir that don't have a corresponding
    // lsif_upload record in the database. This will happen in the cases where an
    // upload overlaps existing uploads which are deleted in batch from the db,
    // but not from disk. This can also happen if the db file is written during
    // processing but fails later while updating commits for that repo.
    await removeDeadDumps(storageRoot, { logger })

    if (maximumSizeBytes < 0) {
        return Promise.resolve()
    }

    let currentSizeBytes = await dirsize(path.join(storageRoot, constants.DBS_DIR))

    while (currentSizeBytes > maximumSizeBytes) {
        // While our current data usage is too big, find candidate dumps to delete
        // TODO
        const url = new URL('http://localhost:3186/prune').href // TODO
        const resp = await got.post(url)

        const payload: { id: number } | null = JSON.parse(resp.body)
        if (!payload) {
            logger.warn(
                'Unable to reduce disk usage of the DB directory because deleting any single dump would drop in-use code intel for a repository.',
                { currentSizeBytes, softMaximumSizeBytes: maximumSizeBytes }
            )

            break
        }

        // Delete this dump and subtract its size from the current dir size
        const filename = dbFilename(storageRoot, payload.id)
        currentSizeBytes -= await filesize(filename)
    }
}

/**
 * Remove db files that are not reachable from a pending or completed upload record.
 *
 * @param storageRoot The path where SQLite databases are stored.
 * @param ctx The tracing context.
 */
async function removeDeadDumps(
    storageRoot: string,
    { logger = createSilentLogger() }: TracingContext = {}
): Promise<void> {
    let count = 0
    for (const basenames of chunk(
        await fs.readdir(path.join(storageRoot, constants.DBS_DIR)),
        settings.DEAD_DUMP_CHUNK_SIZE
    )) {
        const pathsById = new Map<number, string>()
        for (const basename of basenames) {
            const id = idFromFilename(basename)
            if (!id) {
                continue
            }

            pathsById.set(id, path.join(storageRoot, constants.DBS_DIR, basename))
        }

        // TODO - should retry if ECONNREFUSED
        const url = new URL('http://localhost:3186/states').href // TODO
        // TODO
        const resp = await got.post(url, {
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: Array.from(pathsById.keys()) }),
        })
        const states: Map<number, string> = parseJSON(resp.body)

        for (const [id, dbPath] of pathsById.entries()) {
            if (!states.has(id) || states.get(id) === 'errored') {
                count++
                await fs.unlink(dbPath)
            }
        }
    }

    if (count > 0) {
        logger.debug('Removed dead dumps', { count })
    }
}

/**
 * Remove the given file if it was last modified longer than `FAILED_UPLOAD_MAX_AGE` seconds
 * ago. Returns true if the file was removed and false otherwise.
 *
 * @param filename The file to remove.
 */
async function purgeFile(filename: string): Promise<boolean> {
    if (Date.now() - (await fs.stat(filename)).mtimeMs < settings.FAILED_UPLOAD_MAX_AGE * 1000) {
        return false
    }

    await fs.unlink(filename)
    return true
}

/**
 * Calculate the size of a directory.
 *
 * @param directory The directory path.
 */
async function dirsize(directory: string): Promise<number> {
    return (
        await Promise.all((await fs.readdir(directory)).map(filename => filesize(path.join(directory, filename))))
    ).reduce((a, b) => a + b, 0)
}

/**
 * Get the file size or zero if it doesn't exist.
 *
 * @param filename The filename.
 */
async function filesize(filename: string): Promise<number> {
    try {
        return (await fs.stat(filename)).size
    } catch (error) {
        if (!(error && error.code === 'ENOENT')) {
            throw error
        }

        return 0
    }
}