#pragma once

/*
  WebServer.h -  wifi services functions class

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

#include "../Config.h"
#include "Commands.h"
#include "UploadError.h"

class WebSocketsServer;
class WebServer;

namespace WebUI {
    //Upload status
    enum class UploadStatusType : uint8_t { NONE = 0, FAILED = 1, CANCELLED = 2, SUCCESSFUL = 3, ONGOING = 4 };

    class Web_Server {
    public:
        Web_Server();

        bool begin();
        void end();
        void handle();

        static long     get_client_ID();
        static uint16_t port() { return _port; }
        ~Web_Server();

    private:
        static bool                _setupdone;
        static WebServer*          _webserver;
        static long                _id_connection;
        static WebSocketsServer*   _socket_server;
        static uint16_t            _port;
        static UploadStatusType    _upload_status;
        static String              getContentType(String filename);
        static String              get_Splited_Value(String data, char separator, int index);

#ifdef ENABLE_SSDP
        static void handle_SSDP();
#endif
        static void handle_root();
        static void handle_fwinfo();
        static void handle_grbl_settings();
        static void handle_esp_settings();
        static void handle_not_found();
        static void _handle_web_command(bool);
        static void _handle_esp_command(bool);
        static void handle_web_command() { _handle_web_command(false); }
        static void handle_esp_command() { _handle_esp_command(false); }
        static void handle_file_boundary();
        static float getStringCoordinates(int startpos, const String line);
        static void handle_web_command_silent() { _handle_web_command(true); }
        static void handle_Websocket_Event(uint8_t num, uint8_t type, uint8_t* payload, size_t length);
        static void SPIFFSFileupload();
        static void handleFileList();
        static void handleUpdate();
        static void WebUpdateUpload();
        static void pushError(UploadError code, const char* st, bool web_error = 500, uint16_t timeout = 1000);
        static void sendStatus(int httpCode, String status);
        static void cancelUpload();
#ifdef ENABLE_SD_CARD
        static void handle_direct_SDFileList();
        static void SDFile_direct_upload();
        static bool deleteRecursive(String path);
#endif
    };

    extern Web_Server web_server;
}
