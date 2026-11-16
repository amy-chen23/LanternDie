FROM python:3.12-slim
WORKDIR /app
COPY model_service/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY model_service /app/model_service
COPY assets/models /app/assets/models
RUN useradd --create-home classifier
USER classifier
EXPOSE 8000
CMD ["uvicorn", "model_service.app:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]
