import inspect
from tiktok_uploader.upload import TikTokUploader

print(inspect.signature(TikTokUploader.upload_video))
