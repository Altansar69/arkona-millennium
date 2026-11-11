local http = require("http")
local json = require("json")
local logger = require("logger")
local millennium = require("millennium")

local API = "https://arkona.dev/api/v1/releases?q=steam%3A"
local GAMES_API = "https://arkona.dev/api/v1/games"
local SITE_API = "https://arkona.dev/api"
local SITE_ORIGIN = "https://arkona.dev"
local TIMEOUT = 15
local CACHE_TTL = 300
local cache = {}
local games_cache = {}
local game_cache = {}
local game_detail_cache = {}
local session = nil

local function response(success, status, items, total, error)
    return json.encode({ success = success, status = status, items = items, total = total, error = error })
end

local function envelope(success, status, data, error)
    return json.encode({ success = success, status = status, data = data, error = error })
end

local function failed(stage, status, error, data)
    logger:error(string.format("%s failed (HTTP %s): %s", stage, tostring(status), tostring(error)))
    return envelope(false, status, data, error)
end

local function header(headers, wanted)
    if type(headers) ~= "table" then return nil end
    wanted = string.lower(wanted)
    for key, value in pairs(headers) do
        if string.lower(tostring(key)) == wanted then return value end
    end
    return nil
end

local function cookie_from(headers)
    local value = header(headers, "set-cookie")
    if type(value) == "table" then value = value[1] end
    if type(value) ~= "string" then return nil end
    return value:match("gamedb_session=([%w]+)")
end

local function escape_path(value)
    return (tostring(value):gsub("([^%w%-_%.~])", function(char)
        return string.format("%%%02X", string.byte(char))
    end))
end

local function protected_headers(mutation)
    local headers = {
        ["Accept"] = "application/json",
        ["Origin"] = SITE_ORIGIN,
        ["Referer"] = SITE_ORIGIN .. "/",
        ["User-Agent"] = "Arkona-Millennium/1.0"
    }
    if session and session.cookie then headers["Cookie"] = "gamedb_session=" .. session.cookie end
    if mutation then
        headers["Content-Type"] = "application/json"
        if session and session.csrf then headers["X-CSRF-Token"] = session.csrf end
    end
    return headers
end

local function request(url, method, data, headers)
    local result, err = http.request(url, {
        method = method,
        data = data,
        headers = headers,
        timeout = TIMEOUT,
        follow_redirects = false
    })
    if not result then return nil, err or "request_failed" end
    return result, nil
end

local function decode_body(result)
    local ok, decoded = pcall(json.decode, result.body or "")
    if not ok or type(decoded) ~= "table" then return nil end
    return decoded
end

local function compact(body)
    local decoded = json.decode(body)
    if type(decoded) ~= "table" or type(decoded.releases) ~= "table" then
        return nil, nil
    end
    local items = {}
    for _, release in ipairs(decoded.releases) do
        items[#items + 1] = {
            n = release.name,
            g = release.group,
            s = release.source,
            z = release.size_bytes,
            h = release.has_nfo,
            l = release.game_slug,
            c = release.category,
            d = release.date
        }
    end
    return items, decoded.total
end

local function compact_games(body)
    local decoded = json.decode(body)
    if type(decoded) ~= "table" or type(decoded.games) ~= "table" then
        return nil, nil, nil, nil
    end
    local items = {}
    for _, game in ipairs(decoded.games) do
        if type(game.slug) == "string" and type(game.title) == "string" then
            items[#items + 1] = {
                s = game.slug,
                t = game.title,
                c = game.cover_url,
                y = game.release_year,
                r = game.rating,
                n = game.release_count,
                p = game.last_posted,
                m = game.summary
            }
        end
    end
    return items, decoded.total, decoded.page, decoded.limit
end

---@ffi
---@param app_id number
---@return string
function FetchArkonaReleases(app_id)
    if type(app_id) ~= "number" or app_id < 1 or app_id ~= math.floor(app_id) then
        return response(false, 400, nil, nil, "invalid_app_id")
    end

    local key = tostring(app_id)
    local hit = cache[key]
    if hit and os.time() - hit.at < CACHE_TTL then
        return hit.value
    end

    local ok, value = pcall(function()
        local result, err = http.get(API .. key .. "&limit=100", {
            headers = {
                ["Accept"] = "application/json",
                ["User-Agent"] = "Arkona-Millennium/1.0"
            },
            timeout = TIMEOUT
        })
        if not result then
            logger:error("Arkona request failed: " .. tostring(err))
            return response(false, 0, nil, nil, err or "request_failed")
        end
        if result.status ~= 200 then
            logger:error("Arkona API returned HTTP " .. tostring(result.status))
            return response(false, result.status, nil, nil, "arkona_api_error")
        end
        local items, total = compact(result.body)
        if not items then
            return response(false, result.status, nil, nil, "invalid_response")
        end
        logger:info(string.format("AppID %d: %d release(s)", app_id, #items))
        return response(true, result.status, items, total, nil)
    end)

    if not ok then
        logger:error("Arkona lookup failed: " .. tostring(value))
        return response(false, 0, nil, nil, "request_failed")
    end

    cache[key] = { at = os.time(), value = value }
    return value
end

---@ffi
---@param query string
---@param page number
---@param sort string
---@param filters string
---@return string
function FetchArkonaGames(query, page, sort, filters)
    if type(query) ~= "string" or #query > 128 or type(page) ~= "number" or page < 1 or
       page ~= math.floor(page) or (sort ~= "date" and sort ~= "title" and
       sort ~= "rating" and sort ~= "most_releases") or type(filters) ~= "string" or
       #filters > 2048 then
        return response(false, 400, nil, nil, "invalid_games_query")
    end

    local filters_ok, selected = pcall(json.decode, filters)
    if not filters_ok or type(selected) ~= "table" then
        return response(false, 400, nil, nil, "invalid_games_filters")
    end
    local allowed = {
        source = { SCENE = true, P2P = true },
        platform = { windows = true, linux = true, macos = true },
        category = { full_game = true, update_fix = true, update = true, crackfix = true, trainer = true },
        nfo = { yes = true, no = true },
        scene_reference = { yes = true, no = true },
        metadata = { yes = true, no = true, igdb = true, steam = true },
        steam = { yes = true, no = true },
        cover = { yes = true, no = true }
    }
    local query_filters = {}
    for name, values in pairs(allowed) do
        local value = selected[name]
        if value ~= nil and value ~= "" then
            if type(value) ~= "string" or not values[value] then
                return response(false, 400, nil, nil, "invalid_games_filters")
            end
            query_filters[#query_filters + 1] = { name, value }
        end
    end
    for _, field in ipairs({ { "group", "group" }, { "genre", "game_genre" },
        { "date_min", "date_min" }, { "date_max", "date_max" } }) do
        local value = selected[field[1]]
        if value ~= nil and value ~= "" then
            if type(value) ~= "string" or #value > 128 or value:find("%c") then
                return response(false, 400, nil, nil, "invalid_games_filters")
            end
            query_filters[#query_filters + 1] = { field[2], value }
        end
    end

    local key = query .. "|" .. tostring(page) .. "|" .. sort .. "|" .. filters
    local hit = games_cache[key]
    if hit and os.time() - hit.at < CACHE_TTL then return hit.value end

    local url = GAMES_API .. "?limit=60&page=" .. tostring(page) .. "&sort=" .. sort
    if query ~= "" then url = url .. "&q=" .. escape_path(query) end
    for _, filter in ipairs(query_filters) do
        url = url .. "&" .. filter[1] .. "=" .. escape_path(filter[2])
    end
    local ok, value = pcall(function()
        local result, err = http.get(url, {
            headers = {
                ["Accept"] = "application/json",
                ["User-Agent"] = "Arkona-Millennium/1.0"
            },
            timeout = TIMEOUT
        })
        if not result then return response(false, 0, nil, nil, err or "request_failed") end
        if result.status ~= 200 then
            return response(false, result.status, nil, nil, "arkona_api_error")
        end
        local items, total, current_page, limit = compact_games(result.body)
        if not items then return response(false, result.status, nil, nil, "invalid_response") end
        return json.encode({
            success = true,
            status = result.status,
            items = items,
            total = total,
            page = current_page,
            limit = limit
        })
    end)
    if not ok then
        logger:error("Arkona games lookup failed: " .. tostring(value))
        return response(false, 0, nil, nil, "request_failed")
    end
    games_cache[key] = { at = os.time(), value = value }
    return value
end

local function first_identifier(game, provider)
    local identifiers = game.identifiers
    local ids = type(identifiers) == "table" and identifiers.ids or nil
    local values = type(ids) == "table" and ids[provider] or nil
    if type(values) == "table" and type(values[1]) == "string" and values[1] ~= "" then
        return values[1]
    end
    return nil
end

local function game_detail(slug)
    local hit = game_detail_cache[slug]
    if hit and os.time() - hit.at < CACHE_TTL then return hit.game, 200, nil end
    local detail, detail_err = http.get(GAMES_API .. "/" .. escape_path(slug), {
        headers = {
            ["Accept"] = "application/json",
            ["User-Agent"] = "Arkona-Millennium/1.0"
        },
        timeout = TIMEOUT
    })
    if not detail then return nil, 0, detail_err or "request_failed" end
    if detail.status ~= 200 then
        return nil, detail.status, detail.status == 404 and "game_not_found" or "arkona_api_error"
    end
    local game = decode_body(detail)
    if not game or type(game.slug) ~= "string" or type(game.title) ~= "string" then
        return nil, detail.status, "invalid_response"
    end
    game_detail_cache[slug] = { at = os.time(), game = game }
    return game, 200, nil
end

---@ffi
---@param slug string
---@return string
function FetchArkonaGamePreview(slug)
    if type(slug) ~= "string" or slug == "" or #slug > 192 or slug:find("[^%w%-_]") then
        return envelope(false, 400, nil, "invalid_game_slug")
    end
    local ok, game, status, err = pcall(game_detail, slug)
    if not ok then return envelope(false, 0, nil, "request_failed") end
    if not game then return envelope(false, status, nil, err) end
    local stores = {}
    for _, provider in ipairs({ "steam", "gog", "epic", "online_fix" }) do
        if first_identifier(game, provider) then stores[#stores + 1] = provider end
    end
    return envelope(true, 200, {
        m = game.summary,
        g = game.genres,
        p = { "PC" },
        st = stores
    }, nil)
end

---@ffi
---@param slug string
---@return string
function FetchArkonaGameDestination(slug)
    if type(slug) ~= "string" or slug == "" or #slug > 192 or slug:find("[^%w%-_]") then
        return envelope(false, 400, nil, "invalid_game_slug")
    end
    local ok, game, status, err = pcall(game_detail, slug)
    if not ok then return envelope(false, 0, nil, "request_failed") end
    if not game then return envelope(false, status, nil, err) end
    return envelope(true, 200, {
        steam = first_identifier(game, "steam"),
        arkona = SITE_ORIGIN .. "/game/" .. escape_path(game.slug)
    }, nil)
end

---@ffi
---@param slug string
---@return string
function FetchArkonaGame(slug)
    if type(slug) ~= "string" or slug == "" or #slug > 192 or
       slug:find("[^%w%-_]") then
        return envelope(false, 400, nil, "invalid_game_slug")
    end

    local hit = game_cache[slug]
    if hit and os.time() - hit.at < CACHE_TTL then return hit.value end

    local ok, value, cacheable = pcall(function()
        local game, status, detail_err = game_detail(slug)
        if not game then return envelope(false, status, nil, detail_err), false end

        local provider, identifier = nil, nil
        if type(game.igdb_id) == "number" and game.igdb_id > 0 then
            provider, identifier = "igdb", tostring(math.floor(game.igdb_id))
        else
            for _, candidate in ipairs({ "steam", "gog", "epic" }) do
                local id = first_identifier(game, candidate)
                if id then provider, identifier = candidate, id break end
            end
        end

        local search = provider and (provider .. ":" .. identifier) or game.title
        local releases, release_err = http.get(
            SITE_ORIGIN .. "/api/v1/releases?q=" .. escape_path(search) .. "&limit=100", {
                headers = {
                    ["Accept"] = "application/json",
                    ["User-Agent"] = "Arkona-Millennium/1.0"
                },
                timeout = TIMEOUT
            })
        if not releases then return envelope(false, 0, nil, release_err or "request_failed"), false end
        if releases.status ~= 200 then return envelope(false, releases.status, nil, "arkona_api_error"), false end
        local items = compact(releases.body)
        if not items then return envelope(false, releases.status, nil, "invalid_response"), false end

        local linked = {}
        for _, release in ipairs(items) do
            if release.l == game.slug then linked[#linked + 1] = release end
        end
        return envelope(true, 200, {
            game = {
                s = game.slug,
                t = game.title,
                c = game.cover_url,
                y = game.release_year,
                r = game.rating,
                n = game.release_count,
                m = game.summary,
                g = game.genres
            },
            items = linked
        }, nil), true
    end)
    if not ok then
        logger:error("Arkona game lookup failed: " .. tostring(value))
        return envelope(false, 0, nil, "request_failed")
    end
    if cacheable then game_cache[slug] = { at = os.time(), value = value } end
    return value
end

---@ffi
---@return string
function GetArkonaSecurityChallenge()
    local result, err = request(
        SITE_API .. "/security/challenge",
        "GET",
        nil,
        protected_headers(false)
    )
    if not result then return failed("security challenge", 0, err, nil) end
    local data = decode_body(result)
    if result.status ~= 200 or not data then
        return failed("security challenge", result.status, data and data.error or "security_challenge_failed", data)
    end
    return envelope(true, result.status, data, nil)
end

---@ffi
---@param challenge string
---@param nonce string
---@return string
function CreateArkonaSession(challenge, nonce)
    if type(challenge) ~= "string" or type(nonce) ~= "string" then
        return failed("session proof", 400, "invalid_proof", nil)
    end
    local result, err = request(
        SITE_API .. "/security/session",
        "POST",
        json.encode({ challenge = challenge, nonce = nonce }),
        protected_headers(true)
    )
    if not result then return failed("session", 0, err, nil) end
    local data = decode_body(result)
    local cookie = cookie_from(result.headers)
    if result.status ~= 200 or not data or type(data.csrf_token) ~= "string" or not cookie then
        session = nil
        return failed("session", result.status, data and data.error or "session_failed", data)
    end
    session = { cookie = cookie, csrf = data.csrf_token, created = os.time() }
    return envelope(true, result.status, { expires_in = data.expires_in }, nil)
end

---@ffi
---@param release_name string
---@param source string
---@return string
function PrepareArkonaDownload(release_name, source)
    if not session or type(release_name) ~= "string" or release_name == "" or
       (source ~= "SCENE" and source ~= "P2P") then
        return failed("download preparation", 401, "session_required", nil)
    end
    local detail, err = request(
        SITE_API .. "/releases/" .. escape_path(release_name),
        "GET",
        nil,
        protected_headers(false)
    )
    if not detail then return failed("release detail", 0, err, nil) end
    local detail_data = decode_body(detail)
    local release = detail_data and detail_data.release
    if detail.status ~= 200 or type(release) ~= "table" or type(release.id) ~= "number" or release.source ~= source then
        return failed("release detail", detail.status, detail_data and detail_data.error or "release_unavailable", detail_data)
    end
    local challenge, challenge_err = request(
        SITE_API .. "/security/download-challenge",
        "POST",
        json.encode({ release_id = release.id }),
        protected_headers(true)
    )
    if not challenge then return failed("download challenge", 0, challenge_err, nil) end
    local challenge_data = decode_body(challenge)
    if challenge.status ~= 200 or type(challenge_data) ~= "table" or challenge_data.mode ~= "altcha" then
        return failed("download challenge", challenge.status, challenge_data and challenge_data.error or "captcha_unavailable", challenge_data)
    end
    return envelope(true, challenge.status, {
        release_id = release.id,
        password = release.password,
        challenge = challenge_data.challenge
    }, nil)
end

---@ffi
---@param release_id number
---@param captcha_token string
---@return string
function ResolveArkonaDownload(release_id, captcha_token)
    if not session or type(release_id) ~= "number" or release_id < 1 or type(captcha_token) ~= "string" then
        return failed("download", 400, "invalid_download_request", nil)
    end
    local result, err = request(
        SITE_API .. "/downloads/" .. tostring(math.floor(release_id)),
        "POST",
        json.encode({ captcha_token = captcha_token }),
        protected_headers(true)
    )
    if not result then return failed("download", 0, err, nil) end
    local data = decode_body(result)
    if result.status ~= 200 or not data then
        return failed("download", result.status, data and data.error or "download_failed", data)
    end
    return envelope(true, result.status, data, nil)
end

local function on_load()
    logger:info("Arkona Releases loaded with Millennium " .. millennium.version())
    millennium.ready()
end

local function on_unload()
    cache = {}
    games_cache = {}
    game_cache = {}
    game_detail_cache = {}
    session = nil
end

return {
    on_load = on_load,
    on_unload = on_unload,
    FetchArkonaReleases = FetchArkonaReleases,
    FetchArkonaGames = FetchArkonaGames,
    FetchArkonaGamePreview = FetchArkonaGamePreview,
    FetchArkonaGameDestination = FetchArkonaGameDestination,
    FetchArkonaGame = FetchArkonaGame,
    GetArkonaSecurityChallenge = GetArkonaSecurityChallenge,
    CreateArkonaSession = CreateArkonaSession,
    PrepareArkonaDownload = PrepareArkonaDownload,
    ResolveArkonaDownload = ResolveArkonaDownload
}
