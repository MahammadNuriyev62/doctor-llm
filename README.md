This is a vibe coded interface for TER project at Paris-Saclay.

Currently deployed at [http://161.35.199.233:8000/](http://161.35.199.233:8000/), it is likely that by the time you read this, the server is down. If you want to run it locally, you can do so by running the following command:

```bash
docker run -it --rm \
  -e SECRET_KEY=MySecretKey \
  -e ALGORITHM=HS512 \
  -e MODEL="nuriyev/Qwen2.5-0.5B-Instruct-medical-dpo" \
  -e MONGO_URI="your_own_mongodb_db" \
  -p 8000:8000 \
  zver12345/doctor-llm
```

- `SECRET_KEY`: Application has dummy login system with only login (no password). This is what generating the jwt token.
- `ALGORITHM`: Algorithm used to generate the jwt token. Default is HS512.
- `MODEL`: Model to use. Default is `nuriyev/Qwen2.5-0.5B-Instruct-medical-dpo`. You can use any model from Hugging Face.
- `MONGO_URI`: MongoDB URI. Default is `mongodb://localhost:27017/`. You can use any MongoDB URI.
- `-p 8000:8000`: Port to expose. The web app will be available at `http://localhost:8000/`.
- `--rm`: Remove the container after it exits.
- `-it`: Run the container in interactive mode.

to remove the image, run:

```bash
docker rmi zver12345/doctor-llm
```

### Don't have any mongoDB instance running?

Then, you should clone the repository

```bash
git clone https://github.com/MahammadNuriyev62/doctor-llm.git
```

And up the docker-compose file, that will additionally run a MongoDB instance for you:

```bash
SECRET_KEY=MySecretKey \
ALGORITHM=HS512 MODEL=myCustomModel \
MODEL="nuriyev/Qwen2.5-0.5B-Instruct-medical-dpo" \
docker-compose up
```

To remove all the pulled images and containers, run:

```bash
docker-compose down --rmi all
```
