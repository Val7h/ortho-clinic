import cloudinary
import cloudinary.uploader
import cloudinary.api
import json

# Configurar Cloudinary com credenciais inline
cloudinary.config(
    cloud_name="dpk8z8jth",
    api_key="951351755643374",
    api_secret="Q6vQTWhL2icK4Q3LPGABpF0HJ2M"
)

print("=" * 60)
print("TESTE CLOUDINARY — OrthoClinic")
print("=" * 60)

# 1. Upload de uma imagem de teste
print("\n[1] Fazendo upload de imagem de teste...")
try:
    # Usar uma imagem pública de demo do Cloudinary
    response = cloudinary.uploader.upload(
        "https://res.cloudinary.com/demo/image/upload/sample.jpg",
        public_id="orthoclinic_test_image",
        overwrite=True,
        resource_type="auto"
    )

    secure_url = response.get("secure_url")
    public_id = response.get("public_id")

    print(f"✓ Upload bem-sucedido!")
    print(f"  Public ID: {public_id}")
    print(f"  URL Segura: {secure_url}")

except Exception as e:
    print(f"✗ Erro no upload: {e}")
    exit(1)

# 2. Buscar detalhes da imagem
print("\n[2] Buscando detalhes da imagem...")
try:
    details = cloudinary.api.resource(public_id)

    width = details.get("width")
    height = details.get("height")
    format_img = details.get("format")
    bytes_size = details.get("bytes")

    print(f"✓ Detalhes obtidos:")
    print(f"  Dimensões: {width}x{height} pixels")
    print(f"  Formato: {format_img}")
    print(f"  Tamanho: {bytes_size:,} bytes ({bytes_size / 1024 / 1024:.2f} MB)")

except Exception as e:
    print(f"✗ Erro ao buscar detalhes: {e}")
    exit(1)

# 3. Transformar a imagem com otimizações automáticas
print("\n[3] Gerando URL transformada com otimizações...")

# f_auto = formato automático (escolhe melhor compressão: webp, avif, etc.)
# q_auto = qualidade automática (otimiza baseado no device)
transformed_url = cloudinary.CloudinaryResource(public_id).build_url(
    fetch_format="auto",  # f_auto
    quality="auto",       # q_auto
    secure=True
)

print(f"✓ URL transformada gerada:")
print(f"  {transformed_url}")

# 4. Mensagem de sucesso
print("\n" + "=" * 60)
print("✓ SUCESSO! Cloudinary está funcionando corretamente.")
print("=" * 60)
print("\n📸 Abre esta URL no browser para ver a imagem otimizada:")
print(f"  {transformed_url}")
print("\n💡 Dica: Compare tamanho e formato com a URL original:")
print(f"  {secure_url}")
print("\n" + "=" * 60)
