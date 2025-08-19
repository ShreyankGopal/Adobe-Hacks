import os
import json
import requests
from typing import Callable, Dict

# from openai import OpenAI
from dotenv import load_dotenv
load_dotenv()
try:
    from google.generativeai import GenerativeModel, configure
except ImportError:
    GenerativeModel = None
    configure = None


class LLMClient:
    def __init__(self):
        self.provider = os.getenv("LLM_PROVIDER")
        if not self.provider:
            raise ValueError("LLM_PROVIDER environment variable is not set.")

        self.provider = self.provider.lower()

        if self.provider == "gemini":
            self._init_gemini()
        elif self.provider == "azure":
            self._init_azure()
        elif self.provider == "openai":
            self._init_openai()
        elif self.provider == "ollama":
            self._init_ollama()
        else:
            raise ValueError(f"Unsupported LLM provider: {self.provider}")

    def _init_gemini(self):
        if not configure or not GenerativeModel:
            raise ImportError("google-generativeai is not installed. Install with `pip install google-generativeai`.")

        creds_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
        if not creds_path or not os.path.exists(creds_path):
            raise FileNotFoundError("Missing or invalid GOOGLE_APPLICATION_CREDENTIALS file path.")

        with open(creds_path, "r") as f:
            creds = json.load(f)

        api_key = creds.get("api_key")
        # print(api_key)
        #api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise ValueError("Google credentials file missing 'api_key'.")

        configure(api_key=api_key)
        self.gemini_model = GenerativeModel(os.getenv("GEMINI_MODEL", "gemini-2.5-flash"))

    # def _init_azure(self):
    #     self.azure_client = OpenAI(
    #         api_key=os.getenv("AZURE_OPENAI_KEY"),
    #         base_url=f"{os.getenv('AZURE_OPENAI_BASE')}/openai/deployments/{os.getenv('AZURE_DEPLOYMENT_NAME')}",
    #         default_query={"api-version": os.getenv("AZURE_API_VERSION")},
    #         default_headers={"api-key": os.getenv("AZURE_OPENAI_KEY")},
    #     )
    #     self.azure_model = os.getenv("AZURE_DEPLOYMENT_NAME")

    # def _init_openai(self):
    #     self.openai_client = OpenAI(
    #         api_key=os.getenv("OPENAI_API_KEY"),
    #         base_url=os.getenv("OPENAI_API_BASE") or None
    #     )
    #     self.openai_model = os.getenv("OPENAI_MODEL", "gpt-4o")

    # def _init_ollama(self):
    #     self.ollama_base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    #     self.ollama_model = os.getenv("OLLAMA_MODEL", "llama3")

    def generate(self, prompt: str) -> str:
        if self.provider == "gemini":
            response = self.gemini_model.generate_content(prompt)
            return response.text.strip()

        elif self.provider == "azure":
            res = self.azure_client.chat.completions.create(
                model=self.azure_model,
                messages=[{"role": "user", "content": prompt}],
            )
            return res.choices[0].message.content.strip()

        elif self.provider == "openai":
            res = self.openai_client.chat.completions.create(
                model=self.openai_model,
                messages=[{"role": "user", "content": prompt}],
            )
            return res.choices[0].message.content.strip()

        elif self.provider == "ollama":
            resp = requests.post(
                f"{self.ollama_base_url}/api/generate",
                json={"model": self.ollama_model, "prompt": prompt},
                stream=False
            )
            data = resp.json()
            return data.get("response", "").strip()

        else:
            raise ValueError(f"Unsupported provider: {self.provider}")
