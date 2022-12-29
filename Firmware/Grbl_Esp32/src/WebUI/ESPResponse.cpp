/*
  ESPResponse.cpp - GRBL_ESP response class

  Copyright (c) 2014 Luc Lebosse. All rights reserved.

  This library is free software; you can redistribute it and/or
  modify it under the terms of the GNU Lesser General Public
  License as published by the Free Software Foundation; either
  version 2.1 of the License, or (at your option) any later version.

  This library is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
  Lesser General Public License for more details.

  You should have received a copy of the GNU Lesser General Public
  License along with this library; if not, write to the Free Software
  Foundation, Inc., 51 Franklin St, Fifth Floor, Boston, MA  02110-1301  USA
*/
#include "../Grbl.h"
#include "ESPResponse.h"
#if defined(ENABLE_HTTP) && defined(ENABLE_WIFI)
#include "WebServer.h"
#include <WebServer.h>
#endif

namespace WebUI
{
#if defined(ENABLE_HTTP) && defined(ENABLE_WIFI)
    ESPResponseStream::ESPResponseStream(WebServer *webserver)
    {
        _header_sent = false;
        _webserver = webserver;
        _client = CLIENT_WEBUI;
    }
#endif

    ESPResponseStream::ESPResponseStream()
    {
        _client = CLIENT_INPUT;
#if defined(ENABLE_HTTP) && defined(ENABLE_WIFI)
        _header_sent = false;
        _webserver = NULL;
#endif
    }

    ESPResponseStream::ESPResponseStream(uint8_t client, bool byid)
    {
        (void)byid; // fake parameter to avoid confusion with pointer one (NULL == 0)
        _client = client;
#if defined(ENABLE_HTTP) && defined(ENABLE_WIFI)
        _header_sent = false;
        _webserver = NULL;
#endif
    }

    // helper to format size to readable string
    String ESPResponseStream::formatBytes(uint64_t bytes)
    {
        if (bytes < 1024)
        {
            return String((uint16_t)bytes) + " B";
        }
        else if (bytes < (1024 * 1024))
        {
            return String((float)(bytes / 1024.0), 2) + " KB";
        }
        else if (bytes < (1024 * 1024 * 1024))
        {
            return String((float)(bytes / 1024.0 / 1024.0), 2) + " MB";
        }
        else
        {
            return String((float)(bytes / 1024.0 / 1024.0 / 1024.0), 2) + " GB";
        }
    }

    void ESPResponseStream::sendJson(const char *data)
    {
        if (_client == CLIENT_INPUT)
        {
            return;
        }
#if defined(ENABLE_HTTP) && defined(ENABLE_WIFI)
        if (_webserver)
        {
            if (!_header_sent)
            {
                _webserver->sendHeader("Content-Type", "application/json");
                _webserver->sendHeader("Cache-Control", "no-cache");
                _webserver->send(200, data);
                _header_sent = true;
            }
            return;
        }
#endif
        grbl_send(_client, data);
    }
}
