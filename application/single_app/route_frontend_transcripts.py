# route_frontend_transcripts.py

from config import *
from functions_authentication import *
from functions_settings import *


def register_route_frontend_transcripts(app):
    @app.route('/transcripts', methods=['GET'])
    @login_required
    @user_required
    @enabled_required("enable_user_workspace")
    def transcripts():
        try:
            current_app.logger.debug('[Transcripts] Rendering transcripts page for user %s', get_current_user_id())

            settings = get_settings()
            public_settings = sanitize_settings_for_user(settings)

            if not settings.get('enable_audio_file_support', False):
                current_app.logger.info('[Transcripts] Audio support disabled in settings – redirecting user %s', get_current_user_id())
                flash('Audio transcription is currently disabled by your administrator.', 'warning')
                return redirect(url_for('chats'))

            audio_extensions = sorted(AUDIO_FILE_EXTENSIONS)
            speech_configured = all([
                settings.get('speech_service_endpoint'),
                settings.get('speech_service_key') or settings.get('speech_service_location')
            ])

            current_app.logger.debug(
                '[Transcripts] Page context prepared. speech_configured=%s, extensions=%s',
                speech_configured,
                ','.join(audio_extensions)
            )

            audio_accept = ",".join(f".{ext.lower()}" for ext in audio_extensions)

            return render_template(
                'transcripts.html',
                settings=public_settings,
                audio_extensions=audio_extensions,
                audio_accept=audio_accept,
                speech_configured=speech_configured,
                speech_service_endpoint=settings.get('speech_service_endpoint'),
                speech_service_locale=settings.get('speech_service_locale')
            )
        except Exception as exc:
            current_app.logger.exception('[Transcripts] Failed to render transcripts page: %s', exc)
            raise
