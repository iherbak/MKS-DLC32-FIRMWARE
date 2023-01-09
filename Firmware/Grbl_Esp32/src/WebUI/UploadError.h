namespace WebUI
{
    enum class UploadError : int
    {
        // Error codes for upload
        ESP_ERROR_FILE_CREATION = 2,
        ESP_ERROR_AUTHENTICATION = 1,
        ESP_ERROR_FILE_WRITE = 3,
        ESP_ERROR_UPLOAD = 4,
        ESP_ERROR_NOT_ENOUGH_SPACE = 5,
        ESP_ERROR_UPLOAD_CANCELLED = 6,
        ESP_ERROR_FILE_CLOSE = 7
    };
}