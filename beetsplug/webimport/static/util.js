function selectCandidate(task_index, candidate_index) {
    $.ajax({
        url: '/api/candidate',
        type: 'PUT',
        contentType: 'application/json',
        data: JSON.stringify({
            "task_index": task_index,
            "candidate_index": candidate_index
        }),
        success: function (data) {
            window.location.replace("/")
        }
    });
}

function distString(distance) {
    return ((1 - distance) * 100).toFixed(2).toString()
}

function human_seconds_short(interval) {
    let floored_interval = Math.floor(interval);
    const hour = Math.floor(floored_interval / 60).toString().padStart(2, "0");
    const minute = (floored_interval % 60).toString().padStart(2, "0");
    return `${hour}:${minute}`
}


function human_bytes(size) {
    const powers = ['', 'K', 'M', 'G', 'T', 'P', 'E', 'Z', 'Y', 'H'];
    let unit = 'B';
    for (let i = 0; i < powers.length; i++) {
        const power = powers[i];
        if (size < 1024) {
            return `${size.toFixed(1)} ${power}${unit}`
        }
        size /= 1024.0;
        unit = 'iB'
    }
    return "big"
}


function duplicateAction(task_index, action) {
    $.ajax({
        url: '/api/resolveDuplicates',
        type: 'PUT',
        contentType: 'application/json',
        data: JSON.stringify({
            "task_index": task_index,
            "duplicate_action": action
        }),
        success: function (data) {
            window.location.replace("/")
        }
    });
}

function hideCandidates(div, button) {
    button.text("show candidates");
    button.click(function () {
        showCandidates(div, button)
    });
    div.css('display', 'none')
}

function showCandidates(div, button) {
    button.text("hide candidates");
    button.click(function () {
        hideCandidates(div, button);
    });
    div.css('display', 'block');
}

function enterSearch(div, task_index) {
    $("button[name='searchNameButton']").remove();
    $("input[name='artist']").remove();
    $("input[name='album']").remove();
    $("button[name='searchIdButton']").remove();
    $("input[name='searchId']").remove();
    var artist = $("<input>").attr("name", "artist").val("artist");
    var album = $("<input>").attr("name", "album").val("album");
    div.append(artist, album);
    const button = $('<button>').attr("name", "searchNameButton").text("search").click(
        function () {
            $.ajax({
                url: '/api/searchName',
                type: 'PUT',
                contentType: 'application/json',
                data: JSON.stringify({
                    "task_index": task_index,
                    'artist': artist.val(),
                    'name': album.val()
                }),
                success: function (data) {
                    window.location.replace("/")
                }
            });
        });
    div.append(button);
}

function enterSearchId(div, task_index) {
    $("button[name='searchIdButton']").remove();
    $("input[name='searchId']").remove();
    $("button[name='searchNameButton']").remove();
    $("input[name='artist']").remove();
    $("input[name='album']").remove();
    const searchId = $("<input>").attr("name", "searchId").val("searchId");
    div.append(searchId);
    const button = $('<button>').attr("name", "searchNameButton").text("search").click(
        function () {
            $.ajax({
                url: '/api/searchId',
                type: 'PUT',
                contentType: 'application/json',
                data: JSON.stringify({
                    "task_index": task_index,
                    'id': searchId.val()
                }),
                success: function (data) {
                    window.location.replace("/")
                }
            });
        });
    div.append(button);
}

class TaskChange {
    constructor() {
        this.candidatesDiv = $("<div>").hide();
        this.div = $("<div>").addClass("taskDiv");
        this.actionsDiv = $("<div>").addClass("actions");
        $('div[id=tasks]').append(this.div);
    }

    display_path(path, item_count) {
        if (typeof path === 'object') {
            if (path.length === 0) {
                return
            }
            for (let i = 0; i < path.length - 1; i++) {
                this.spanLine(path[i]);
            }
            this.spanLine(`${path[path.length - 1]} (${item_count} items)`);
        } else if (typeof path === 'string') {
            this.spanLine(`${path} (${item_count} items)`);
        }
    }

    addButtons(index) {
        const candidatesDiv = this.candidatesDiv;
        const actionsDiv = this.actionsDiv;
        this.createButton(this.actionsDiv, function () {
            applyTask(index)
        }, "Apply");
        this.createButton(this.actionsDiv, function () {
            skip(index)
        }, "Skip");
        this.createButton(this.actionsDiv, function () {
            asIs(index)
        }, "As Is");
        this.createButton(this.actionsDiv, function () {
            asTracks(index)
        }, "As Tracks");
        this.createButton(this.actionsDiv, function () {
            enterSearch(actionsDiv, index)
        }, "enter Search");
        this.createButton(this.actionsDiv, function () {
            enterSearchId(actionsDiv, index)
        }, "enter Id");
        const candidateButton = $('<button>').text("show candidates");
        candidateButton.click(function () {
            showCandidates(candidatesDiv, candidateButton)
        });
        this.actionsDiv.append(candidateButton);
    }

    duplicateActions(index) {
        this.createButton(this.actionsDiv, function () {
            skip(index)
        }, "Skip new");
        this.createButton(this.actionsDiv, function () {
            duplicateAction(index, 'k')
        }, "Keep both");
        this.createButton(this.actionsDiv, function () {
            duplicateAction(index, 'r')
        }, "Remove old");
        this.createButton(this.actionsDiv, function () {
            duplicateAction(index, 'm')
        }, "Merge all");
    }

    createButton(el, fn, t) {
        const button = $('<button>').text(t).click(fn);
        el.append(button);
    }

    line(node) {
        this.div.append(node);
        this.div.append($('<br>'));
    }

    table(rows, el = this.div) {
        const table = $('<table>');
        for (let i = 0; i < rows.length; i++) {
            table.append(rows[i]);
        }
        el.append(table);
    }

    static row(elems) {
        const tr = $('<tr>');
        for (let i = 0; i < elems.length; i++) {
            tr.append($('<td>').text(elems[i]));
        }
        return tr;
    }

    spanLine(t, indend = false) {
        const node = $("<span>").text(t);
        if (indend) {
            node.attr("class", "indend");
        }
        this.line(node);
    }

    static penaltyString(distance) {
        const penalties = [];
        const keys = distance.penalties;
        for (let j = 0; j < keys.length; j++) {
            keys[j] = keys[j].replace("album_", "");
            keys[j] = keys[j].replace("track_", "");
            keys[j] = keys[j].replace("_", " ");
            penalties.push(keys[j]);
        }
        if (penalties.length > 0) {
            return `(${penalties.join(", ")})`;
        }
        return '';
    }

    static disambigString(info) {
        const disambig = [];
        if (info.data_source && info.data_source !== "MusicBrainz") {
            disambig.push(info.data_source);
        }
        if (info.media) {
            if (info.mediums && info.mediums > 1) {
                disambig.push(`${info.mediums}x${info.media}`);
            } else {
                disambig.push(info.media);
            }
        }
        if (info.year) {
            disambig.push(info.year);
        }
        if (info.country) {
            disambig.push(info.country);
        }
        if (info.label) {
            disambig.push(info.label);
        }
        if (info.catalognum) {
            disambig.push(info.catalognum);
        }
        if (info.albumdisambig) {
            disambig.push(info.albumdisambig);
        }
        return disambig.join(", ");
    }

    showAlbum(artist, album) {
        if (artist) {
            this.spanLine(`${artist} - ${album}`, true);
        } else if (album) {
            this.spanLine(`${album}`, true);
        } else {
            this.spanLine("(unknown album)", true);
        }
    }

    static summarize_items(items, singleton) {
        const summary_parts = [];
        if (!singleton) {
            summary_parts.push(`${items.length} items`);
        }

        const format_counts = new Map();

        let average_bitrate = 0;
        let total_duration = 0;
        let total_filesize = 0;
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            format_counts.set(item.format, (format_counts.get(item.format) || 0) + 1);
            average_bitrate += item.bitrate;
            total_duration += item.length;
            total_filesize += item.filesize;
        }
        if (format_counts.length === 1) {
            summary_parts.push(items[0].format)
        } else {
            const format_entries = format_counts.entries();
            for (let i = 0; i < format_entries.length; i++) {
                let fmt = format_entries[i][0];
                let count = format_entries[i][1];
                summary_parts.push(`${fmt} ${count}`)
            }
        }

        summary_parts.push(`${Math.floor(average_bitrate / items.length / 1000)}kbps`);
        summary_parts.push(`${human_seconds_short(total_duration)}`);
        summary_parts.push(`${human_bytes(total_filesize)}`);
        return summary_parts.join(", ");
    }

    info_line(match) {
        const info = [];
        info.push(`(Similarity: ${distString(match.distance.distance)})`);
        let penalties = TaskChange.penaltyString(match.distance);
        if (penalties !== '') {
            info.push(penalties);
        }

        const disambig = TaskChange.disambigString(match.info);
        if (disambig !== '') {
            info.push(`(${disambig})`);
        }
        this.spanLine(info.join(" "));
    }

    showItemChange(task, match, index) {
        const cur_artist = task.artist;
        const new_artist = match.info.artist;
        const cur_title = task.title;
        const new_title = match.info.title;
        if (task.found_duplicates) {
            this.spanLine(`"${cur_artist} - ${cur_title}" is already in the Library`);
            for (let i = 0; i < task.found_duplicates.length; i++) {
                const duplicate = task.found_duplicates[i];
                this.spanLine(`Old: ${TaskChange.summarize_items([duplicate], true)}`);
            }
            this.spanLine(`New: ${TaskChange.summarize_items(task.imported_items, true)}`);
            this.duplicateActions(index);
            this.div.append(this.actionsDiv);
            return
        }

        if (cur_artist !== new_artist || cur_title !== new_title) {
            this.spanLine("Correcting track tags from:");
            this.spanLine(`${cur_artist} - ${cur_title}`, true);
            this.spanLine("To:");
            this.spanLine(`${new_artist} - ${new_title}`, true);
        } else {
            this.spanLine(`Tagging track: ${cur_artist} ${cur_title}`)
        }

        if (match.info.data_url !== "undefined") {
            this.spanLine(`${match.info.data_url}`, true)
        }

        this.info_line(match);

        this.addButtons(index);
        this.div.append(this.actionsDiv);

        let rows = [];
        for (let i = 0; i < task.candidates.length; i++) {
            let candidate = task.candidates[i];
            const tr = $('<tr>');
            tr.append($('<td>').append($('<button>').text("select").click(function () {
                selectCandidate(index, i);
            })));
            tr.append($('<td>').text(`${candidate.info.artist} - ${candidate.info.title} 
             (${((1 - candidate.distance.distance) * 100).toFixed(2)}%)
              ${TaskChange.penaltyString(candidate.distance)}
               (${TaskChange.disambigString(candidate.info)})`));
            rows.push(tr);
        }
        this.table(rows, this.candidatesDiv);

        this.div.append(this.candidatesDiv);

    }

    summerizeItems(task, match, index) {
        if (task.found_duplicates) {
            this.spanLine(`"${task.cur_artist} - ${task.cur_album}" is already in the Library`);
            for (let i = 0; i < task.found_duplicates.length; i++) {
                const duplicate = task.found_duplicates[i];
                this.spanLine(`Old: ${TaskChange.summarize_items(duplicate.items, false)}`);
            }
            this.spanLine(`New: ${TaskChange.summarize_items(task.imported_items, false)}`);
            this.duplicateActions(index);
            this.div.append(this.actionsDiv);
            return
        }
        this.display_path(task.paths, task.items.length);
        if (task.candidates.length <= 0) {
            let e1 = $("<span>").attr("text", "no candidates found");
            $("div[id='tasks']").append(e1);
            return;
        }
        if (task.cur_artist !== match.info.artist || (task.cur_album !== match.info.album && match.info.album !== "letious Artists")) {
            let artist_l = null;
            let album_l = null;
            if (typeof task.cur_artist !== 'undefined') {
                artist_l = task.cur_artist;
            }
            if (typeof task.cur_album !== 'undefined') {
                album_l = task.cur_album;
            }
            let artist_r = match.info.artist;
            const album_r = match.info.album;
            if (match.info.artist === 'letious Artists') {
                artist_l = '';
                artist_r = '';
            }
            this.spanLine("Correcting tags from:");
            this.showAlbum(artist_l, album_l);
            this.spanLine("To:");
            this.showAlbum(artist_r, album_r)
        } else {
            this.spanLine("Tagging:");
            this.spanLine(`${match.info.artist} - ${match.info.album}`, true);
        }

        if (match.info.data_url) {
            this.spanLine("URL:");
            this.spanLine(`${match.info.data_url}`, true)
        }

        this.info_line(match);

        // tracks
        const pairs = match.mapping;
        pairs.sort();

        const lines = [];
        let medium = null;
        let disctitle = null;
        for (let i = 0; i < pairs.length; i++) {

            // Medium number and title.
            const item = pairs[i][0];
            const track_info = pairs[i][1];
            if (medium !== track_info || disctitle !== track_info.disctitle) {
                let media = match.info.media;
                if (!media) {
                    media = "Media";
                }
                let lhs = false;
                if (match.info.mediums > 1 && track_info.disctitle) {
                    lhs = `${media} ${track_info.medium}: ${track_info.dicstitle}`;
                } else if (match.info.mediums > 1) {
                    lhs = `${media} ${track_info.medium}`;
                } else if (track_info.dicstitle) {
                    lhs = `${media}: ${track_info.discttile}`
                }
                if (lhs) {
                    lines.push([lhs, "", 0])
                }
                medium = track_info.medium;
                disctitle = track_info.disctitle;
            }

            // Titles
            const new_title = track_info.title;
            let cur_title = item.path;
            if (item.title) {
                cur_title = item.title;
            }
            let lhs = cur_title;
            let rhs = new_title;
            let lhs_width = cur_title.length;

            // Track number change.
            const cur_track = item.track;
            const new_track = track_info.index;
            if (cur_track !== new_track) {
                lhs = `(#${cur_track}) ${lhs}`;
                rhs = `(#${new_track}) ${rhs}`;
                lhs_width += cur_track.length + 4;
            }

            // Length change.
            // TODO

            // Penalties
            const penalties = TaskChange.penaltyString(match.distance.tracks[track_info.track_id]);
            if (lhs !== rhs || penalties) {
                lines.push([` * ${lhs}`, `-> ${rhs}`, penalties])
            }
        }

        let rows = [];
        for (let i = 0; i < lines.length; i++) {
            rows.push(TaskChange.row(lines[i]));
        }
        this.table(rows);

        // Missing and unmatched tracks.
        if (typeof match.extra_tracks !== 'undefined' && match.extra_tracks.length > 0) {
            this.spanLine(`Missing tracks (${match.extra_tracks.length}/${match.info.tracks.length})`);
            for (let i = 0; i < match.extra_tracks.length; i++) {
                const track_info = match.extra_tracks[i];
                this.spanLine(`! (${track_info.title} (#${track_info.index}) (${human_seconds_short(track_info.length)})`, true);
            }
        }


        if (typeof match.extra_items !== 'undefined') {
            this.spanLine(`Unmatched tracks (${match.extra_items.length})`);
            for (let i = 0; i < match.extra_items.length; i++) {
                const item = match.extra_items[i];
                let length = '';
                if (item.length) {
                    const interval = Math.floor(track_info.length);
                    length = ` (${Math.floor(interval / 60)}:${interval % 60})`
                }
                this.spanLine(`! (${item.title} (#${item.index})${length}`, true);
            }
        }

        this.addButtons(index);
        this.div.append(this.actionsDiv);

        // candidates
        rows = [];
        for (let i = 0; i < task.candidates.length; i++) {
            let candidate = task.candidates[i];
            const tr = $('<tr>');
            tr.append($('<td>').append($('<button>').text("select").click(function () {
                selectCandidate(index, i);
            })));
            tr.append($('<td>').text(`${candidate.info.artist} - ${candidate.info.album} 
             (${((1 - candidate.distance.distance) * 100).toFixed(2)}%)
              ${TaskChange.penaltyString(candidate.distance)}
               (${TaskChange.disambigString(candidate.info)})`));
            rows.push(tr);
        }
        this.table(rows, this.candidatesDiv);

        this.div.append(this.candidatesDiv);
    }
}

window.onload = function () {
    $.ajax({
        url: '/api/tasks',
        type: 'GET',
        success: function (tasks) {
            for (let task_id in tasks) {
                const task = tasks[task_id];
                let match = task.match;
                if (match === "None") {
                    match = task.candidates[0];
                }
                if (task.is_album) {
                    new TaskChange().summerizeItems(task, match, task_id);
                } else {
                    new TaskChange().showItemChange(task, match, task_id)
                }
            }
        },
        error: function (xhr, ajaxOptions, thrownError) {
            const errorMsg = 'Ajax request failed: ' + xhr.responseText;
            $('#content').html(errorMsg);
        }
    });
};