# -*- coding: utf-8 -*-
# This file is part of beets.
# Copyright 2016, Adrian Sampson.
#
# Permission is hereby granted, free of charge, to any person obtaining
# a copy of this software and associated documentation files (the
# "Software"), to deal in the Software without restriction, including
# without limitation the rights to use, copy, modify, merge, publish,
# distribute, sublicense, and/or sell copies of the Software, and to
# permit persons to whom the Software is furnished to do so, subject to
# the following conditions:
#
# The above copyright notice and this permission notice shall be
# included in all copies or substantial portions of the Software.

"""A Web interface to beets."""
from __future__ import division, absolute_import, print_function

from typing import Union

from beets.autotag import Distance, AlbumMatch, AlbumInfo, TrackInfo, \
    TrackMatch
from flask.json import jsonify, JSONEncoder

from beets.importer import action, SingletonImportTask, ImportTask, \
    _freshen_items
from beets.plugins import BeetsPlugin
from beets import ui, plugins
from beets import util
import beets.library
import flask
from flask import g, request
from werkzeug.routing import BaseConverter, PathConverter
import os
from unidecode import unidecode
import json
import base64

# Utilities.
from beets.ui.commands import dist_string, penalty_string, disambig_string
from beetsplug.webimport.WebImporter import WebImporter


def _rep(obj, expand=False):
    """Get a flat -- i.e., JSON-ish -- representation of a beets Item or
    Album object. For Albums, `expand` dictates whether tracks are
    included.
    """
    out = dict(obj)

    if isinstance(obj, beets.library.Item):
        if app.config.get('INCLUDE_PATHS', False):
            out['path'] = util.displayable_path(out['path'])
        else:
            del out['path']

        # Filter all bytes attributes and convert them to strings.
        for key, value in out.items():
            if isinstance(out[key], bytes):
                out[key] = base64.b64encode(value).decode('ascii')

        # Get the size (in bytes) of the backing file. This is useful
        # for the Tomahawk resolver API.
        try:
            out['size'] = os.path.getsize(util.syspath(obj.path))
        except OSError:
            out['size'] = 0

        return out

    elif isinstance(obj, beets.library.Album):
        del out['artpath']
        if expand:
            out['items'] = [_rep(item) for item in obj.items()]
        return out


def json_generator(items, root, expand=False):
    """Generator that dumps list of beets Items or Albums as JSON

    :param root:  root key for JSON
    :param items: list of :class:`Item` or :class:`Album` to dump
    :param expand: If true every :class:`Album` contains its items in the json
                   representation
    :returns:     generator that yields strings
    """
    yield '{"%s":[' % root
    first = True
    for item in items:
        if first:
            first = False
        else:
            yield ','
        yield json.dumps(_rep(item, expand=expand))
    yield ']}'


def is_expand():
    """Returns whether the current request is for an expanded response."""

    return flask.request.args.get('expand') is not None


def resource(name):
    """Decorates a function to handle RESTful HTTP requests for a resource.
    """

    def make_responder(retriever):
        def responder(ids):
            entities = [retriever(id) for id in ids]
            entities = [entity for entity in entities if entity]

            if len(entities) == 1:
                return flask.jsonify(_rep(entities[0], expand=is_expand()))
            elif entities:
                return app.response_class(
                    json_generator(entities, root=name),
                    mimetype='application/json'
                )
            else:
                return flask.abort(404)

        responder.__name__ = 'get_{0}'.format(name)
        return responder

    return make_responder


def resource_query(name):
    """Decorates a function to handle RESTful HTTP queries for resources.
    """

    def make_responder(query_func):
        def responder(queries):
            return app.response_class(
                json_generator(
                    query_func(queries),
                    root='results', expand=is_expand()
                ),
                mimetype='application/json'
            )

        responder.__name__ = 'query_{0}'.format(name)
        return responder

    return make_responder


def resource_list(name):
    """Decorates a function to handle RESTful HTTP request for a list of
    resources.
    """

    def make_responder(list_all):
        def responder():
            return app.response_class(
                json_generator(list_all(), root=name, expand=is_expand()),
                mimetype='application/json'
            )

        responder.__name__ = 'all_{0}'.format(name)
        return responder

    return make_responder


def _get_unique_table_field_values(model, field, sort_field):
    """ retrieve all unique values belonging to a key from a model """
    if field not in model.all_keys() or sort_field not in model.all_keys():
        raise KeyError
    with g.lib.transaction() as tx:
        rows = tx.query('SELECT DISTINCT "{0}" FROM "{1}" ORDER BY "{2}"'
                        .format(field, model._table, sort_field))
    return [row[0] for row in rows]


class IdListConverter(BaseConverter):
    """Converts comma separated lists of ids in urls to integer lists.
    """

    def to_python(self, value):
        ids = []
        for id in value.split(','):
            try:
                ids.append(int(id))
            except ValueError:
                pass
        return ids

    def to_url(self, value):
        return ','.join(value)


class QueryConverter(PathConverter):
    """Converts slash separated lists of queries in the url to string list.
    """

    def to_python(self, value):
        return value.split('/')

    def to_url(self, value):
        return ','.join(value)


class EverythingConverter(PathConverter):
    regex = '.*?'


class TaskEncoder(JSONEncoder):

    def default(self, o):
        if isinstance(o, SingletonImportTask):
            return {
                'artist': o.item.artist,
                'title': o.item.title,
                'match': self.default(o.match),
                'candidates': self.default(o.candidates),
                'imported_items': o.imported_items() if
                hasattr(o, 'found_duplicates') else None,
                'found_duplicates': self.default(o.found_duplicates) if
                hasattr(o, 'found_duplicates') else None,
            }
        if isinstance(o, ImportTask):
            return {
                'candidates': self.default(o.candidates),
                'match': self.default(o.match),
                'cur_album': o.cur_album,
                'cur_artist': o.cur_artist,
                'is_album': o.is_album,
                'items': self.default(o.items),
                'paths': [str(p) for p in o.paths],
                # 'toppath': o.toppath,
                'imported_items': o.imported_items() if
                hasattr(o, 'found_duplicates') else None,
                'found_duplicates': self.default(o.found_duplicates) if
                hasattr(o, 'found_duplicates') else None,
            }
        if isinstance(o, AlbumMatch):
            return {
                'distance': self.default(o.distance),
                'info': o.info,
                'mapping': [(self.default(key), value)
                            for key, value in o.mapping.items()],
                'extra_tracks': o.extra_tracks
            }
        if isinstance(o, TrackMatch):
            return {
                'distance': self.default(o.distance),
                'info': o.info,
            }
        if isinstance(o, Distance):
            return {
                'distance': o.distance,
                'penalties': o.keys(),
                'tracks': dict((x.track_id, self.default(y))
                               for x, y in o.tracks.items())
                if hasattr(o, 'tracks') else dict()
            }
        if isinstance(o, list):
            return [self.default(x) for x in o]
        if isinstance(o, AlbumInfo):
            return o.__dict__
        if isinstance(o, beets.library.Item):
            return {
                'title': o.title.strip(),
                'path': o.path,
                'track': o.track,
                'format': o.format,
                'bitrate': o.bitrate,
                'filesize': o.filesize,
                'length': o.length
            }
        if isinstance(o, beets.library.Album):
            return {
                'items': self.default(list(o.items()))
            }
        return str(o)


# Flask setup.

app = flask.Flask(__name__)
app.url_map.converters['idlist'] = IdListConverter
app.url_map.converters['query'] = QueryConverter
app.url_map.converters['everything'] = EverythingConverter
app.json_encoder = TaskEncoder

session: Union[WebImporter, None] = None


@app.before_request
def before_request():
    g.lib = app.config['lib']


@app.route('/', methods=['GET', 'POST'])
def run_import():
    global session
    if request.method == 'GET':
        return flask.render_template('import.html')
    elif request.method == 'POST':
        form = request.form
        if not form or 'path' not in form or not type(form['path']) is str:
            return "paths must be a set"
        paths = [form['path']]
        session = None
        session = WebImporter(g.lib, None, paths, None)
        session.run()
        return flask.render_template('import.html')


@app.route('/api/<int:task_id>')
def import_info(task_id):
    global session
    return jsonify(session.tasks[task_id])


@app.route('/api/tasks')
def get_tasks():
    global session
    if session:
        return jsonify(session.tasks)
    return jsonify([])


@app.route('/api/candidate', methods=['PUT'])
def import_choose_candidate():
    global session
    data = request.get_json()
    session.choose_candidate(data['task_index'], data['candidate_index'])
    return jsonify(session.tasks[data['task_index']])


@app.route('/api/skip', methods=['PUT'])
def import_skip():
    global session
    data = request.get_json()
    task = session.tasks.pop(data['task_index'])
    return jsonify(task)


@app.route('/api/searchId', methods=['PUT'])
def search_id():
    global session
    data = request.get_json()
    task = session.search_id(data['task_index'], data['id'])
    return jsonify(task)


@app.route('/api/searchName', methods=['PUT'])
def search_name():
    global session
    data = request.get_json()
    task = session.search_name(data['task_index'], data['artist'],
                               data['name'])
    return jsonify(task)


@app.route('/api/asIs', methods=['PUT'])
def import_as_is():
    global session
    data = request.get_json()
    task = session.tasks[data['task_index']]
    task.set_choice(action.ASIS)
    if session.resolved_duplicates(data['task_index']):
        session.import_task(data['task_index'])
    return jsonify(task)


@app.route('/api/asTracks', methods=['PUT'])
def import_as_tracks():
    global session
    data = request.get_json()
    task = session.tasks[data['task_index']]
    task.set_choice(action.TRACKS)
    session.as_tracks(data['task_index'])
    return jsonify(task)


@app.route('/api/resolveDuplicates', methods=['PUT'])
def import_resolve_duplicates():
    global session
    data = request.get_json()
    task = session.tasks[data['task_index']]
    if not task.match:
        task.set_choice(task.candidates[0])

    sel = data['duplicate_action']
    if sel == u'k':
        # Keep both. Do nothing; leave the choice intact.
        pass
    elif sel == u'r':
        # Remove old.
        task.should_remove_duplicates = True
    elif sel == u'm':
        session.merge_duplicates(data['task_index'])
        return jsonify([])

    session.import_task(data['task_index'])
    return jsonify(task)


@app.route('/api/apply', methods=['PUT'])
def import_apply():
    global session
    data = request.get_json()
    task = session.tasks[data['task_index']]
    if not task.match:
        task.set_choice(task.candidates[0])
    if session.resolved_duplicates(data['task_index']):
        session.import_task(data['task_index'])
    return jsonify(task)


# Plugin hook.

class WebImportPlugin(BeetsPlugin):
    def __init__(self):
        super(WebImportPlugin, self).__init__()
        self.config.add({
            'host': u'127.0.0.1',
            'port': 8337,
            'cors': '',
            'cors_supports_credentials': False,
            'reverse_proxy': False,
            'include_paths': False,
        })

    def commands(self):
        cmd = ui.Subcommand('webimport', help=u'start a import web interface')
        cmd.parser.add_option(u'-d', u'--debug', action='store_true',
                              default=False, help=u'debug mode')

        def func(lib, opts, args):
            args = ui.decargs(args)
            if args:
                self.config['host'] = args.pop(0)
            if args:
                self.config['port'] = int(args.pop(0))

            app.config['lib'] = lib
            # Normalizes json output
            app.config['JSONIFY_PRETTYPRINT_REGULAR'] = False

            app.config['INCLUDE_PATHS'] = self.config['include_paths']

            # Enable CORS if required.
            if self.config['cors']:
                self._log.info(u'Enabling CORS with origin: {0}',
                               self.config['cors'])
                from flask_cors import CORS
                app.config['CORS_ALLOW_HEADERS'] = "Content-Type"
                app.config['CORS_RESOURCES'] = {
                    r"/*": {"origins": self.config['cors'].get(str)}
                }
                CORS(
                    app,
                    supports_credentials=self.config[
                        'cors_supports_credentials'
                    ].get(bool)
                )

            # Allow serving behind a reverse proxy
            if self.config['reverse_proxy']:
                app.wsgi_app = ReverseProxied(app.wsgi_app)

            # Start the web application.
            app.run(host=self.config['host'].as_str(),
                    port=self.config['port'].get(int),
                    debug=opts.debug, threaded=True)

        cmd.func = func
        return [cmd]


class ReverseProxied(object):
    '''Wrap the application in this middleware and configure the
    front-end server to add these headers, to let you quietly bind
    this to a URL other than / and to an HTTP scheme that is
    different than what is used locally.

    In nginx:
    location /myprefix {
        proxy_pass http://192.168.0.1:5001;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Scheme $scheme;
        proxy_set_header X-Script-Name /myprefix;
        }

    From: http://flask.pocoo.org/snippets/35/

    :param app: the WSGI application
    '''

    def __init__(self, app):
        self.app = app

    def __call__(self, environ, start_response):
        script_name = environ.get('HTTP_X_SCRIPT_NAME', '')
        if script_name:
            environ['SCRIPT_NAME'] = script_name
            path_info = environ['PATH_INFO']
            if path_info.startswith(script_name):
                environ['PATH_INFO'] = path_info[len(script_name):]

        scheme = environ.get('HTTP_X_SCHEME', '')
        if scheme:
            environ['wsgi.url_scheme'] = scheme
        return self.app(environ, start_response)
