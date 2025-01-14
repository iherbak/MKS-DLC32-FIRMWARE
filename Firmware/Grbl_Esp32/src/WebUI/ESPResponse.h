#pragma once

/*
  ESPResponse.h - GRBL_ESP response class

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

#if defined(ENABLE_HTTP) && defined(ENABLE_WIFI)
#include <WebServer.h>
#endif

namespace WebUI {
    class ESPResponseStream {
    public:
#if defined(ENABLE_HTTP) && defined(ENABLE_WIFI)
        WebServer* _webserver;
        ESPResponseStream(WebServer* webserver);
        WebServer* webserver() { return _webserver;}
#endif
        ESPResponseStream(uint8_t client, bool byid = true);
        ESPResponseStream();

        void          sendJson(const char* data);
        static String formatBytes(uint64_t bytes);
        uint8_t       client() { return _client; }

    private:
        uint8_t _client;
    };
}
