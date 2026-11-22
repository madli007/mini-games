/* =====================================================================
   Vmesnik adapterjev (samo JSDoc tipi — za dokumentacijo in IDE).
   Igre adapterjev NE uporabljajo neposredno; uporabljajo hub.js in room.js.
   ===================================================================== */

/**
 * @typedef {Object} Profile
 * @property {string} id
 * @property {string} nickname
 * @property {{emoji:string, color:string}} avatar
 * @property {number} xp
 */

/**
 * @typedef {Object} RoomRow
 * @property {string} code
 * @property {string} game
 * @property {string} host_id
 * @property {'lobby'|'playing'|'finished'} status
 * @property {number} max_players
 * @property {Object} settings
 * @property {boolean} is_public
 * @property {string} created_at
 * @property {string} updated_at
 */

/**
 * Realtime kanal sobe.
 * @typedef {Object} Transport
 * @property {(meta:Object) => Promise<void>} track      objavi svoje presence podatke
 * @property {() => Object[]} presence                   trenutno prisotni (meta)
 * @property {(cb:(list:Object[])=>void) => Function} onPresence
 * @property {(type:string, payload:any) => void} send   broadcast vsem (tudi sebi)
 * @property {(cb:(type:string, payload:any, from:string)=>void) => Function} onMessage
 * @property {() => Promise<void>} close
 */

/**
 * Backend (local ali supabase). Vse metode so asinhrone; napake imajo `err.code`:
 * room_not_found, room_started, room_full, version_conflict, nickname_taken, no_profile, not_host …
 * @typedef {Object} Backend
 * @property {'local'|'supabase'} kind
 * @property {string} userId
 * @property {() => Promise<string>} init
 * @property {(id?:string) => Promise<Profile|null>} getProfile
 * @property {(p:{nickname:string, avatar:Object}) => Promise<Profile>} saveProfile
 * @property {(ids:string[]) => Promise<Profile[]>} getProfiles
 * @property {(limit?:number) => Promise<Profile[]>} topXp
 * @property {(amount:number, reason?:string) => Promise<{xp:number, granted:number}>} awardXp
 * @property {(o:{game:string, score:number, seed?:string|null, meta?:Object}) => Promise<Object>} submitScore
 * @property {(o:{game:string, seed?:string|null, since?:Date|null, limit?:number, asc?:boolean}) => Promise<Object[]>} getLeaderboard
 * @property {(o:{game:string, seed?:string|null, asc?:boolean}) => Promise<number|null>} getMyBest
 * @property {(o:{game:string, key:string, title?:string, icon?:string}) => Promise<boolean>} unlock
 * @property {(o?:{game?:string, userId?:string}) => Promise<Object[]>} getAchievements
 * @property {(o:{game:string, name:string, hash:string, data:Object, devMs:number, replace?:string|null}) => Promise<{id:string, updated:boolean}>} publishLevel
 * @property {(o:{game:string, sort?:'new'|'popular', limit?:number, userId?:string|null}) => Promise<Object[]>} listLevels
 * @property {(o:{game:string, id:string}) => Promise<Object|null>} getLevel
 * @property {(o:{game:string, id:string}) => Promise<boolean>} deleteLevel
 * @property {(o:{game:string, id:string}) => Promise<boolean>} levelPlayed
 * @property {(o:{game:string, maxPlayers?:number, settings?:Object, isPublic?:boolean}) => Promise<RoomRow>} createRoom
 * @property {(code:string) => Promise<RoomRow>} joinRoom
 * @property {(code:string) => Promise<Object|null>} findRoom
 * @property {(code:string) => Promise<RoomRow|null>} getRoom
 * @property {(code:string) => Promise<{user_id:string, joined_at:string}[]>} getRoomPlayers
 * @property {(code:string, patch:Object) => Promise<RoomRow>} updateRoom
 * @property {(code:string) => Promise<RoomRow>} claimHost
 * @property {(code:string, userId:string) => Promise<void>} removePlayer
 * @property {(o?:{freshMinutes?:number}) => Promise<Object[]>} listLobbies
 * @property {(cb:Function) => Function} onLobbiesChange
 * @property {(code:string) => Promise<{state:any, version:number}>} getState
 * @property {(code:string, state:any, expectedVersion?:number|null) => Promise<number>} setState
 * @property {(code:string, move:any) => Promise<number>} pushMove
 * @property {(code:string, sinceSeq?:number) => Promise<Object[]>} getMoves
 * @property {(code:string) => Transport} channel
 */

export {};
